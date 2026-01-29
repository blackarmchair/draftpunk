/**
 * Projection Engine
 * Core projection logic for Best Ball, PWOPR, PWRB, and Power Rankings
 */

import type {
  NFLState,
  MetaMap,
  StatRow,
  SleeperLeague,
  SleeperRoster,
  SleeperUser,
  BestBallProjection,
  PWOPRDisplayRow,
  PWRBDisplayRow,
  PowerRankingTeam,
  PWOPRDataStrategy,
  WoprRow,
  RBInputs,
  PWRBWeights,
  PWRBOutput,
  BaseRow,
  SleeperProjection,
  ESPNProjectionsRow,
} from '../types'
import {
  getWeekMatchups,
  getNFLSchedule,
  getSleeperProjections,
  getWeekActuals,
  getPlayersMeta,
  getPriorYearPPGForPlayers,
  getWeekTeamStats,
  getRosters,
  getUsers,
  getKTCValues,
  CURRENT_YEAR,
  WEEKS,
} from './sleeperApi'
import {
  loadWeeklyRTMData,
  loadSeasonAveragedRTMData,
  createPlayerKey,
  validateRTMData,
  getDataLoadingStrategy,
} from './rtmDataManager'
import { countSlots, pickBestBall, FLEX_MAP } from '../utils/positionHelpers'
import {
  calculateTrend,
  calculateEWMA,
  getSampleSizeConfidence,
  calculateTimeWeight,
  isFiniteNumber,
  isFinitePositiveNumber,
  safeDiv,
  clamp01,
} from '../utils/mathHelpers'
import {
  getInjuryProbability,
  getInjuryImpact,
  applyInjuryAdjustment,
} from '../utils/injuryHelpers'
import {
  getPositionAverage,
  applyPositionBasedRegression,
} from '../utils/positionHelpers'
import { scoreWithPWOPR } from '../utils/predict'

// ============================================================
// Best Ball Projections
// ============================================================

export async function getBestBallProjections(
  league: SleeperLeague,
  rosters: SleeperRoster[],
  users: SleeperUser[],
  playersMeta: MetaMap,
  leagueId: string,
  nflState: NFLState
): Promise<BestBallProjection[]> {
  const byeWeeks = getNFLSchedule()

  const slotsCount = countSlots(
    league.roster_positions || ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'WRRBTE', 'SUPER_FLEX']
  )

  const rosterIdToUser: Record<number, string> = {}
  for (const r of rosters) {
    const u = users.find((u) => u.user_id === r.owner_id)
    rosterIdToUser[r.roster_id] = u?.display_name ?? `Roster ${r.roster_id}`
  }

  const seasonTotals: Record<number, number> = {}
  const projectedTotals: Record<number, number> = {}
  for (const r of rosters) {
    seasonTotals[r.roster_id] = 0
    projectedTotals[r.roster_id] = 0
  }

  const playerPerformance: Record<string, number[]> = {}

  // Process completed weeks
  for (const week of WEEKS) {
    if (week >= nflState.week) break

    const matchups = await getWeekMatchups(week, leagueId)

    const weeklyRosters: Record<
      number,
      { players: string[]; points: Record<string, number> }
    > = {}
    for (const matchup of matchups) {
      if (matchup?.roster_id && matchup?.players && matchup?.players_points) {
        weeklyRosters[matchup.roster_id] = {
          players: matchup.players || [],
          points: matchup.players_points || {},
        }
      }
    }

    for (const r of rosters) {
      const points: { player_id: string; pos: string; proj: number }[] = []
      const weekData = weeklyRosters[r.roster_id]
      if (!weekData) continue

      for (const pid of weekData.players) {
        const meta = playersMeta[pid]
        const pos =
          meta?.position ||
          (Array.isArray(meta?.fantasy_positions) ? meta.fantasy_positions[0] : null)
        if (!pos) continue

        const actualPoints = weekData.points[String(pid)] ?? 0
        points.push({ player_id: String(pid), pos, proj: actualPoints })

        if (!playerPerformance[pid]) {
          playerPerformance[pid] = []
        }
        playerPerformance[pid].push(actualPoints)
      }

      const weekTotal = pickBestBall(points, slotsCount)
      seasonTotals[r.roster_id] += weekTotal
      projectedTotals[r.roster_id] += weekTotal
    }
  }

  // Calculate player averages and trends
  const playerAverages: Record<string, number> = {}
  const playerTrends: Record<string, number> = {}

  for (const [playerId, performances] of Object.entries(playerPerformance)) {
    const nonZero = performances.filter((p) => p > 0)
    if (nonZero.length === 0) {
      playerAverages[playerId] = 0
      playerTrends[playerId] = 0
      continue
    }

    playerAverages[playerId] = calculateEWMA(nonZero, 0.3)
    playerTrends[playerId] = calculateTrend(nonZero)
  }

  // Fetch Sleeper projections for future weeks
  const futureWeeks = WEEKS.filter((w) => w > nflState.week)
  const sleeperProjectionsByWeek: Record<number, Record<string, number>> = {}

  for (const week of futureWeeks) {
    try {
      const projections = await getSleeperProjections(week, CURRENT_YEAR)
      const projMap: Record<string, number> = {}
      for (const proj of projections) {
        if (proj.player_id && proj.stats?.pts_ppr) {
          projMap[proj.player_id] = proj.stats.pts_ppr
        }
      }
      sleeperProjectionsByWeek[week] = projMap
    } catch {
      sleeperProjectionsByWeek[week] = {}
    }
  }

  // Project future weeks
  for (const week of futureWeeks) {
    for (const r of rosters) {
      const points: { player_id: string; pos: string; proj: number }[] = []
      const currentRosterPlayers = r.players || []

      for (const pid of currentRosterPlayers) {
        const meta = playersMeta[pid]
        if (!meta) continue

        const pos =
          meta?.position ||
          (Array.isArray(meta?.fantasy_positions) ? meta.fantasy_positions[0] : null)
        if (!pos) continue

        if (!meta.active) continue
        if (meta.team && byeWeeks[meta.team]?.includes(week)) continue

        const sleeperProj = sleeperProjectionsByWeek[week]?.[pid] || null
        const injuryProb = getInjuryProbability(meta.injury_status)
        const injuryImpact = getInjuryImpact(meta.injury_status)

        if (injuryProb === 0 && sleeperProj === null) continue

        const historicalAvg = playerAverages[pid] || 0
        const trend = playerTrends[pid] || 0
        const performances = playerPerformance[pid] || []
        const nonZero = performances.filter((p) => p > 0)
        const sampleConfidence = getSampleSizeConfidence(nonZero.length)
        const weeksOut = futureWeeks.indexOf(week) + 1

        let projectedPoints = 0

        if (sleeperProj !== null && historicalAvg > 0) {
          const historicalWeight = 0.35 * sampleConfidence
          const sleeperWeight = 0.6
          const trendWeight = 0.05
          const trendAdjustment = trend * weeksOut
          projectedPoints =
            historicalWeight * historicalAvg +
            sleeperWeight * sleeperProj +
            trendWeight * trendAdjustment
        } else if (sleeperProj !== null) {
          projectedPoints = sleeperProj
        } else if (historicalAvg > 0) {
          const trendAdjustment = trend * weeksOut * 0.2
          projectedPoints = historicalAvg + trendAdjustment
        }

        const positionMean = getPositionAverage(pos)
        projectedPoints = projectedPoints + 0.12 * (positionMean - projectedPoints)

        if (!(sleeperProj !== null && sleeperProj > 0 && injuryProb === 0)) {
          projectedPoints = projectedPoints * injuryProb * injuryImpact
        }

        projectedPoints = Math.max(0, projectedPoints)
        points.push({ player_id: String(pid), pos, proj: projectedPoints })
      }

      const weekTotal = pickBestBall(points, slotsCount)
      projectedTotals[r.roster_id] += weekTotal
    }
  }

  // Calculate final standings
  const rosterRecords = rosters.map((r) => ({
    rosterId: r.roster_id,
    ownerName: rosterIdToUser[r.roster_id],
    ytdPoints: seasonTotals[r.roster_id],
    projectedPoints: projectedTotals[r.roster_id] - seasonTotals[r.roster_id],
    totalPoints: projectedTotals[r.roster_id],
    actualPF: (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100,
    rank: 0,
  }))

  // Sort by actual PF to determine playoffs
  const byActualPF = [...rosterRecords].sort((a, b) => b.actualPF - a.actualPF)
  const playoffTeams = new Set(byActualPF.slice(0, 6).map((r) => r.rosterId))

  // Sort non-playoff teams by projected total (lowest first for best pick)
  const nonPlayoff = rosterRecords
    .filter((r) => !playoffTeams.has(r.rosterId))
    .sort((a, b) => a.totalPoints - b.totalPoints)

  // Sort playoff teams by projected total
  const playoff = rosterRecords
    .filter((r) => playoffTeams.has(r.rosterId))
    .sort((a, b) => a.totalPoints - b.totalPoints)

  // Combine and assign draft order
  const finalOrder = [...nonPlayoff, ...playoff]
  return finalOrder.map((r, index) => ({
    rosterId: r.rosterId,
    ownerName: r.ownerName,
    ytdPoints: Math.round(r.ytdPoints * 100) / 100,
    projectedPoints: Math.round(r.projectedPoints * 100) / 100,
    totalPoints: Math.round(r.totalPoints * 100) / 100,
    rank: index + 1,
    draftOrder: index + 1,
  }))
}

// ============================================================
// PWOPR Projections (WR/TE)
// ============================================================

const ELIGIBLE_POS = new Set(['WR', 'RB', 'TE'])

function mapWoprToPPG(wopr: number): number {
  if (wopr <= 0.1) return wopr * 20
  if (wopr <= 0.2) return 2 + (wopr - 0.1) * 20
  if (wopr <= 0.3) return 4 + (wopr - 0.2) * 20
  if (wopr <= 0.4) return 6 + (wopr - 0.3) * 20
  if (wopr <= 0.5) return 8 + (wopr - 0.4) * 20
  if (wopr <= 0.6) return 10 + (wopr - 0.5) * 20
  if (wopr <= 0.7) return 12 + (wopr - 0.6) * 20
  if (wopr <= 0.8) return 14 + (wopr - 0.7) * 20
  if (wopr <= 0.9) return 16 + (wopr - 0.8) * 20
  if (wopr <= 1.0) return 18 + (wopr - 0.9) * 20
  return Math.min(20 + (wopr - 1.0) * 10, 30)
}

function getPWOPRTier(pwopr: number): string {
  if (pwopr >= 20) return 'Elite'
  if (pwopr >= 15) return 'WR1'
  if (pwopr >= 12) return 'WR2/TE1'
  if (pwopr >= 9) return 'WR3/Flex'
  if (pwopr >= 6) return 'Deep Flex'
  return 'Bench'
}

export async function getPWOPRProjections(
  leagueId: string,
  dataStrategy?: PWOPRDataStrategy,
  nflState?: NFLState
): Promise<PWOPRDisplayRow[]> {
  const week = (nflState?.week ?? 2) - 1

  const [stats, meta, priorYearPPG] = await Promise.all([
    getWeekActuals(week),
    getPlayersMeta(),
    getPriorYearPPGForPlayers(leagueId, [], CURRENT_YEAR - 1),
  ])

  let sleeperProjections: SleeperProjection[] = []
  try {
    sleeperProjections = await getSleeperProjections(week + 1, CURRENT_YEAR)
  } catch {
    sleeperProjections = []
  }

  // Load RTM data
  const strategy = dataStrategy
    ? { strategy: dataStrategy, weeksToAverage: undefined }
    : getDataLoadingStrategy(week)
  let rtmData: ESPNProjectionsRow[]

  if (strategy.strategy === 'season-average' || strategy.strategy === 'recent-average') {
    rtmData = await loadSeasonAveragedRTMData(week, strategy.weeksToAverage)
  } else {
    rtmData = await loadWeeklyRTMData(week)
  }

  const rtmMap = new Map<string, ESPNProjectionsRow>()
  for (const r of rtmData) {
    if (!r.full_nm || !r.tm) continue
    rtmMap.set(createPlayerKey(r.full_nm, r.tm), r)
  }

  const sleeperProjectionsMap = new Map<string, SleeperProjection>()
  for (const p of sleeperProjections) {
    if (!p.player_id) continue
    sleeperProjectionsMap.set(p.player_id, p)
  }

  // Build base rows
  const rows: BaseRow[] = []
  const teamTotals = new Map<string, { tgt: number; air: number }>()

  // Calculate team totals
  for (const playerId of Object.keys(meta)) {
    const m = meta[playerId]
    const s = stats[playerId]
    if (!s || !m) continue

    const pos = (m.position ?? m.fantasy_positions?.[0] ?? '').toUpperCase()
    const team = m.team ?? ''
    if (!team || !ELIGIBLE_POS.has(pos) || m.active !== true) continue

    const tgt = s.rec_tgt ?? 0
    const air = s.rec_air_yd ?? 0
    const agg = teamTotals.get(team) ?? { tgt: 0, air: 0 }
    agg.tgt += tgt
    agg.air += air
    teamTotals.set(team, agg)
  }

  // Build player rows
  for (const playerId of Object.keys(meta)) {
    const m = meta[playerId]
    const s = stats[playerId]
    if (!s || !m) continue

    const pos = (m.position ?? m.fantasy_positions?.[0] ?? '').toUpperCase()
    const team = m.team ?? ''
    if (!team || !ELIGIBLE_POS.has(pos) || m.active !== true) continue

    const key = createPlayerKey(m.full_name, m.team)
    const rtm = rtmMap.get(key)
    const sleeperProj = sleeperProjectionsMap.get(playerId)

    const targets = s.rec_tgt ?? 0
    const airYards = s.rec_air_yd ?? 0
    const { tgt: teamTargets, air: teamAirYards } = teamTotals.get(team) ?? { tgt: 0, air: 0 }

    const targetShare = teamTargets > 0 ? targets / teamTargets : 0
    const airYardShare = teamAirYards > 0 ? airYards / teamAirYards : 0
    const wopr = 1.5 * targetShare + 0.7 * airYardShare

    rows.push({
      player_id: playerId,
      name: m.full_name ?? playerId,
      team,
      pos,
      targets,
      airYards,
      teamTargets,
      teamAirYards,
      targetShare,
      airYardShare,
      wopr,
      overall: rtm?.overall ?? null,
      priorYearPPG: priorYearPPG.find((p) => p.playerId === playerId)?.ppg ?? null,
      fantasyProjection: sleeperProj?.stats?.pts_ppr ?? null,
      pts_ppr: s.pts_ppr ?? null,
    })
  }

  // Calculate PWOPR
  const displayRows: PWOPRDisplayRow[] = rows
    .filter((r) => r.pos === 'WR' || r.pos === 'TE')
    .map((r) => {
      const wopr_ppg = isFiniteNumber(r.wopr) ? mapWoprToPPG(r.wopr) : 0
      const ovr_ppg = r.overall != null ? (r.overall / 100) * 20 : null
      const prior = r.priorYearPPG != null && r.priorYearPPG > 0 ? r.priorYearPPG : null

      // Calculate PWOPR
      const components: number[] = []
      if (r.fantasyProjection) components.push(r.fantasyProjection * 0.4)
      if (wopr_ppg > 0) components.push(wopr_ppg * 0.3)
      if (ovr_ppg) components.push(ovr_ppg * 0.2)
      if (prior) components.push(prior * 0.1)

      let pwopr =
        components.length > 0
          ? components.reduce((a, b) => a + b, 0) /
            (0.4 + (wopr_ppg > 0 ? 0.3 : 0) + (ovr_ppg ? 0.2 : 0) + (prior ? 0.1 : 0))
          : wopr_ppg

      // Apply injury adjustment
      const playerMeta = meta[r.player_id]
      const injuryProb = getInjuryProbability(playerMeta?.injury_status)
      const injuryImpact = getInjuryImpact(playerMeta?.injury_status)
      pwopr = pwopr * injuryProb * injuryImpact

      const stdDev = pwopr * 0.2

      return {
        rank: 0,
        name: r.name,
        team: r.team,
        pos: r.pos,
        pwopr: Math.round(pwopr * 100) / 100,
        floor: Math.round((pwopr - stdDev) * 100) / 100,
        ceiling: Math.round((pwopr + stdDev) * 100) / 100,
        consistency: r.wopr > 0.5 ? 0.8 : r.wopr > 0.3 ? 0.6 : 0.4,
        tier: getPWOPRTier(pwopr),
        sleeperProj: r.fantasyProjection ?? undefined,
        injuryStatus: playerMeta?.injury_status ?? null,
      }
    })
    .filter((r) => r.pwopr > 0)
    .sort((a, b) => b.pwopr - a.pwopr)

  // Assign ranks
  displayRows.forEach((r, i) => {
    r.rank = i + 1
  })

  return displayRows
}

// ============================================================
// PWRB Projections (RB)
// ============================================================

const DEFAULT_PWRB_WEIGHTS: PWRBWeights = {
  WOR: 0.4,
  CEI: 0.3,
  RWO: 0.2,
  Stability: 0.1,
  rushShareWeight: 0.8,
  targetShareWeight: 1.2,
  ceiYardsCreated: 0.3,
  ceiMissedTacklesPerTouch: 0.3,
  ceiBreakawayRate: 0.2,
  ceiSuccessRate: 0.2,
  rwoPerTarget: 1.5,
  agePenaltyPerYearOver25: 0.05,
}

function computeWOR(inputs: RBInputs, weights = DEFAULT_PWRB_WEIGHTS): number {
  const rushShare = clamp01(safeDiv(inputs.playerRushAttempts, inputs.teamRushAttempts))
  const targetShare = clamp01(
    safeDiv(inputs.playerTargets, Math.max(inputs.teamRBTargets, inputs.playerTargets))
  )
  return weights.rushShareWeight * rushShare + weights.targetShareWeight * targetShare
}

function computeCEI(inputs: RBInputs, weights = DEFAULT_PWRB_WEIGHTS): number {
  const yc = inputs.yardsCreatedPerTouch ?? 0
  const brk = safeDiv(inputs.breakawayRuns ?? 0, inputs.rushAttempts ?? inputs.playerRushAttempts)
  const sr = safeDiv(inputs.successfulRushes ?? 0, inputs.rushAttempts ?? inputs.playerRushAttempts)

  const normYC = yc / 3
  const normBRK = brk / 0.08
  const normSR = (sr - 0.45) / 0.15

  return weights.ceiYardsCreated * normYC + weights.ceiBreakawayRate * normBRK + weights.ceiSuccessRate * normSR
}

function computeRWO(inputs: RBInputs, weights = DEFAULT_PWRB_WEIGHTS): number {
  return weights.rwoPerTarget * safeDiv(inputs.playerTargets, inputs.games)
}

function computeStability(role: RBInputs['role']): number {
  switch (role) {
    case 'lead':
      return 2
    case 'committee':
      return 1
    default:
      return 0
  }
}

function ageMultiplier(age: number, penaltyPerYear = 0.05): number {
  if (age <= 25) return 1
  return Math.max(0.7, 1 - penaltyPerYear * (age - 25))
}

function computePWRB(inputs: RBInputs, weights = DEFAULT_PWRB_WEIGHTS): PWRBOutput {
  const wor = computeWOR(inputs, weights)
  const cei = computeCEI(inputs, weights)
  const rwo = computeRWO(inputs, weights)
  const stability = computeStability(inputs.role)

  const blended = weights.WOR * wor + weights.CEI * cei + weights.RWO * rwo + weights.Stability * stability
  const ageMult = ageMultiplier(inputs.age, weights.agePenaltyPerYearOver25)
  const pwrb = blended * ageMult

  return {
    wor,
    cei,
    rwo,
    stability,
    ageMultiplier: ageMult,
    blended,
    pwrb,
    supporting: {},
  }
}

function getPWRBTier(pwrb: number): string {
  if (pwrb >= 1.5) return 'Elite'
  if (pwrb >= 0.8) return 'RB1'
  if (pwrb >= 0.5) return 'RB2'
  if (pwrb >= 0.35) return 'RB3/Flex'
  if (pwrb >= 0.2) return 'Deep Flex'
  return 'Bench'
}

export async function getPWRBProjections(
  leagueId: string,
  dataStrategy?: PWOPRDataStrategy,
  nflState?: NFLState
): Promise<PWRBDisplayRow[]> {
  const week = (nflState?.week ?? 2) - 1

  const [stats, meta, teamStats, priorYearPPG] = await Promise.all([
    getWeekActuals(week),
    getPlayersMeta(),
    getWeekTeamStats(week),
    getPriorYearPPGForPlayers(leagueId, [], CURRENT_YEAR - 1),
  ])

  let sleeperProjections: SleeperProjection[] = []
  try {
    sleeperProjections = await getSleeperProjections(week + 1, CURRENT_YEAR)
  } catch {
    sleeperProjections = []
  }

  const sleeperProjectionsMap = new Map<string, SleeperProjection>()
  for (const p of sleeperProjections) {
    if (!p.player_id) continue
    sleeperProjectionsMap.set(p.player_id, p)
  }

  const displayRows: PWRBDisplayRow[] = []

  for (const playerId of Object.keys(meta)) {
    const m = meta[playerId]
    const s = stats[playerId]
    if (!s || !m) continue

    const pos = (m.position ?? m.fantasy_positions?.[0] ?? '').toUpperCase()
    const team = m.team ?? ''
    if (!team || pos !== 'RB' || m.active !== true) continue

    const sleeperProj = sleeperProjectionsMap.get(playerId)

    // Get team totals
    const teamKey = `TEAM_${team}`
    const teamData = teamStats[teamKey]
    const teamTotals = {
      rushAttempts: teamData?.rush_att ?? 100,
      targets: teamData?.rec_tgt ?? 50,
    }

    const rushAttempts = s.rush_att ?? 0
    const targets = s.rec_tgt ?? 0

    if (rushAttempts === 0 && targets === 0) continue

    const rbInputs: RBInputs = {
      teamRushAttempts: Math.max(1, teamTotals.rushAttempts),
      playerRushAttempts: rushAttempts,
      teamRBTargets: Math.max(1, teamTotals.targets),
      playerTargets: targets,
      games: s.gp ?? 1,
      yardsCreatedPerTouch: s.rush_yac ? s.rush_yac / Math.max(1, rushAttempts + targets) : undefined,
      touches: rushAttempts + targets,
      breakawayRuns: (s.rush_lng ?? 0) >= 15 ? 1 : 0,
      rushAttempts,
      successfulRushes: Math.round((s.rush_att ?? 0) * 0.5),
      age: m.age ?? 25,
      role: (() => {
        const snapShare = teamTotals.rushAttempts > 0 ? (s.off_snp ?? 0) / (teamData?.tm_off_snp ?? 100) : 0
        if (snapShare >= 0.6) return 'lead' as const
        if (snapShare >= 0.35) return 'committee' as const
        return 'backup' as const
      })(),
    }

    const pwrbOutput = computePWRB(rbInputs)

    // Apply injury adjustment
    const injuryProb = getInjuryProbability(m.injury_status)
    const injuryImpact = getInjuryImpact(m.injury_status)
    const adjustedPWRB = pwrbOutput.pwrb * injuryProb * injuryImpact

    const stdDev = adjustedPWRB * 0.25

    displayRows.push({
      rank: 0,
      name: m.full_name ?? playerId,
      team,
      pwrb: Math.round(adjustedPWRB * 1000) / 1000,
      wor: Math.round(pwrbOutput.wor * 1000) / 1000,
      cei: Math.round(pwrbOutput.cei * 1000) / 1000,
      rwo: Math.round(pwrbOutput.rwo * 1000) / 1000,
      floor: Math.round((adjustedPWRB - stdDev) * 1000) / 1000,
      ceiling: Math.round((adjustedPWRB + stdDev) * 1000) / 1000,
      tier: getPWRBTier(adjustedPWRB),
      age: m.age,
      role: rbInputs.role,
    })
  }

  // Sort and rank
  displayRows.sort((a, b) => b.pwrb - a.pwrb)
  displayRows.forEach((r, i) => {
    r.rank = i + 1
  })

  return displayRows.filter((r) => r.pwrb > 0)
}

// ============================================================
// Power Rankings
// ============================================================

function pickOptimalLineupByValue(
  players: Array<{ player_id: string; pos: string; value: number; name: string }>,
  slots: Record<string, number>
): {
  totalValue: number
  positionalValues: Record<string, number>
} {
  const used = new Set<string>()
  let totalValue = 0
  const positionalValues: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }

  const takeTop = (eligiblePositions: Set<string>, n: number, countTowardPositional: boolean) => {
    const available = players.filter((p) => !used.has(p.player_id) && eligiblePositions.has(p.pos))
    const pool = available.sort((a, b) => b.value - a.value).slice(0, n)

    for (const p of pool) {
      used.add(p.player_id)
      totalValue += p.value
      if (countTowardPositional && positionalValues[p.pos] !== undefined) {
        positionalValues[p.pos] += p.value
      }
    }
  }

  const takeTopWithQBTracking = (eligiblePositions: Set<string>, n: number) => {
    const pool = players
      .filter((p) => !used.has(p.player_id) && eligiblePositions.has(p.pos))
      .sort((a, b) => b.value - a.value)
      .slice(0, n)

    for (const p of pool) {
      used.add(p.player_id)
      totalValue += p.value
      if (p.pos === 'QB') {
        positionalValues['QB'] += p.value
      }
    }
  }

  // Fill position-specific slots
  if (slots['QB']) takeTop(new Set(['QB']), slots['QB'], true)
  if (slots['RB']) takeTop(new Set(['RB']), slots['RB'], true)
  if (slots['WR']) takeTop(new Set(['WR']), slots['WR'], true)
  if (slots['TE']) takeTop(new Set(['TE']), slots['TE'], true)

  // Fill FLEX slots
  if (slots['FLEX']) takeTop(FLEX_MAP['FLEX'], slots['FLEX'], false)
  if (slots['WRRB']) takeTop(FLEX_MAP['WRRB'], slots['WRRB'], false)
  if (slots['WRRBTE']) takeTop(FLEX_MAP['WRRBTE'], slots['WRRBTE'], false)

  // Fill SUPER_FLEX
  if (slots['SUPER_FLEX']) takeTopWithQBTracking(FLEX_MAP['SUPER_FLEX'], slots['SUPER_FLEX'])

  return { totalValue, positionalValues }
}

export async function getPowerRankings(
  league: SleeperLeague,
  leagueId: string
): Promise<PowerRankingTeam[]> {
  const [ktcValues, rosters, users, playersMeta] = await Promise.all([
    getKTCValues(),
    getRosters(leagueId),
    getUsers(leagueId),
    getPlayersMeta(),
  ])

  if (Object.keys(ktcValues).length === 0) {
    console.error('No KTC values loaded')
    return []
  }

  const slotsCount = countSlots(
    league.roster_positions || ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'WRRBTE', 'SUPER_FLEX']
  )

  const rosterIdToUser: Record<number, { name: string; teamName?: string }> = {}
  for (const roster of rosters) {
    const user = users.find((u) => u.user_id === roster.owner_id)
    rosterIdToUser[roster.roster_id] = {
      name: user?.display_name ?? `Roster ${roster.roster_id}`,
      teamName: user?.metadata?.team_name,
    }
  }

  const rankings: PowerRankingTeam[] = []

  for (const roster of rosters) {
    const playerValues: Array<{ player_id: string; pos: string; value: number; name: string }> = []

    for (const playerId of roster.players || []) {
      const meta = playersMeta[playerId]
      if (!meta) continue

      const pos =
        meta?.position ||
        (Array.isArray(meta?.fantasy_positions) ? meta.fantasy_positions[0] : null)
      const name = meta?.full_name || `${meta?.first_name} ${meta?.last_name}` || playerId

      if (!pos) continue

      const value = ktcValues[playerId] || 0
      if (value === 0) continue

      playerValues.push({ player_id: playerId, pos, value, name })
    }

    const { totalValue, positionalValues } = pickOptimalLineupByValue(playerValues, slotsCount)

    rankings.push({
      rank: 0,
      rosterId: roster.roster_id,
      ownerName: rosterIdToUser[roster.roster_id].name,
      teamName: rosterIdToUser[roster.roster_id].teamName,
      totalValue,
      qbValue: positionalValues['QB'] || 0,
      rbValue: positionalValues['RB'] || 0,
      wrValue: positionalValues['WR'] || 0,
      teValue: positionalValues['TE'] || 0,
      pickValue: 0,
    })
  }

  // Sort and rank
  rankings.sort((a, b) => b.totalValue - a.totalValue)
  rankings.forEach((r, i) => {
    r.rank = i + 1
  })

  return rankings
}

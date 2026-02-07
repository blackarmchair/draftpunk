/**
 * Sleeper API Service
 * Consolidated API fetchers for league data, rosters, projections, and stats
 */

import { normalizeName } from '../utils/normalizeName'

// Inline types for Sleeper API responses (standings types removed from main types.ts)
interface SleeperLeague {
  league_id: string
  name: string
  status: string
  sport: string
  season: string
  season_type: string
  total_rosters: number
  roster_positions: string[]
  scoring_settings: Record<string, number>
  settings: { playoff_teams?: number; [key: string]: unknown }
}

interface SleeperRoster {
  roster_id: number
  owner_id: string
  players: string[]
  starters: string[]
  reserve: string[] | null
  taxi: string[] | null
  settings: {
    wins: number; losses: number; ties: number; fpts: number
    fpts_decimal?: number; fpts_against?: number; fpts_against_decimal?: number
    ppts?: number; ppts_decimal?: number
  }
}

interface SleeperUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: { team_name?: string; [key: string]: unknown }
}

type MetaMap = Record<string, {
  player_id: string; full_name: string; position: string; team: string
  fantasy_positions: string[]; search_full_name: string; active: boolean
  injury_status: string | null; age: number; years_exp: number
  [key: string]: unknown
}>

type Scoring = Record<string, number>

interface NFLState {
  week: number; leg: number; season: string; season_type: string
  league_season: string; previous_season: string; season_start_date: string
  display_week: number; league_create_season: string; season_has_scores: boolean
}

interface SleeperProjection {
  status: string | null; date: string; stats: Record<string, number>
  category: string; last_modified: number; week: number; sport: string
  season_type: string; season: string; team: string; player_id: string
  updated_at: number; game_id: string; company: string; opponent: string
  player: {
    fantasy_positions: string[]; first_name: string; last_name: string
    position: string; team: string; injury_status: string | null
    team_abbr: string | null; years_exp: number
    injury_body_part: string | null; injury_notes: string | null
    injury_start_date: string | null; team_changed_at: string | null
    news_updated: number; metadata: { channel_id: string; rookie_year?: string; [key: string]: unknown }
  }
}

type StatRow = Record<string, number>

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'
const CURRENT_YEAR = 2025
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)

/**
 * Fetch league metadata
 */
export async function getLeague(leagueId: string): Promise<SleeperLeague> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`)
  if (!res.ok) throw new Error(`Failed to fetch league: ${res.status}`)
  return res.json()
}

/**
 * Fetch all rosters in a league
 */
export async function getRosters(leagueId: string): Promise<SleeperRoster[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`)
  if (!res.ok) throw new Error(`Failed to fetch rosters: ${res.status}`)
  return res.json()
}

/**
 * Fetch all users in a league
 */
export async function getUsers(leagueId: string): Promise<SleeperUser[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`)
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
  return res.json()
}

/**
 * Fetch NFL player metadata
 */
export async function getPlayersMeta(): Promise<MetaMap> {
  const res = await fetch(`${SLEEPER_API_BASE}/players/nfl`)
  if (!res.ok) throw new Error(`Failed to fetch players metadata: ${res.status}`)
  return res.json()
}

/**
 * Fetch week projections as a keyed map
 */
export async function getWeekProjMap(
  week: number,
  year: number = CURRENT_YEAR
): Promise<Record<string, number>> {
  const map: Record<string, number> = {}

  // Preferred: stats/projections (keyed object)
  const url = `${SLEEPER_API_BASE}/stats/nfl/projections?season_type=regular&season=${year}&week=${week}&grouping=week`
  try {
    const res = await fetch(url)
    if (res.ok) {
      const obj = (await res.json()) as Record<string, Record<string, number>>
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [pid, row] of Object.entries(obj)) {
          const pts =
            row?.pts_ppr ?? row?.fp_ppr ?? row?.ppr ?? row?.fantasy_points_ppr ?? row?.points_ppr ?? 0
          map[String(pid)] = Number(pts) || 0
        }
        if (Object.keys(map).length > 0) return map
      }
    }
  } catch (e) {
    console.warn('stats/projections error:', e)
  }

  return map
}

/**
 * Fetch week actuals as a keyed map of PPR points
 */
export async function getWeekActualsMap(
  week: number,
  year: number = CURRENT_YEAR
): Promise<Record<string, number>> {
  const url = `${SLEEPER_API_BASE}/stats/nfl/regular/${year}/${week}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn('stats actuals', res.status)
    return {}
  }
  const obj = (await res.json()) as Record<string, Record<string, number>>
  const map: Record<string, number> = {}
  for (const [pid, row] of Object.entries(obj || {})) {
    const pts =
      row?.pts_ppr ?? row?.fp_ppr ?? row?.ppr ?? row?.fantasy_points_ppr ?? row?.points_ppr ?? 0
    map[String(pid)] = Number(pts) || 0
  }
  return map
}

/**
 * Fetch week actuals with full stat rows
 */
export async function getWeekActuals(
  week: number,
  year: number = CURRENT_YEAR
): Promise<Record<string, StatRow>> {
  const url = `${SLEEPER_API_BASE}/stats/nfl/regular/${year}/${week}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn('stats actuals', res.status)
    return {}
  }
  return (await res.json()) as Record<string, StatRow>
}

/**
 * Fetch week matchups for a league
 */
export async function getWeekMatchups(
  week: number,
  leagueId: string
): Promise<
  Array<{
    roster_id: number
    players: string[]
    players_points: Record<string, number>
    matchup_id: number
  }>
> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${week}`)
  if (!res.ok) {
    console.warn(`Week ${week} matchups fetch failed:`, res.status)
    return []
  }
  return res.json()
}

/**
 * Fetch league name
 */
export async function getLeagueName(leagueId: string): Promise<string> {
  try {
    const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`)
    if (!res.ok) return `League ${leagueId}`
    const league = await res.json()
    return league.name || `League ${leagueId}`
  } catch {
    return `League ${leagueId}`
  }
}

/**
 * Fetch current NFL state (week, season, etc.)
 */
export async function getNFLState(): Promise<NFLState> {
  const res = await fetch(`${SLEEPER_API_BASE}/state/nfl`)
  if (!res.ok) throw new Error(`Failed to fetch NFL state: ${res.status}`)
  return res.json()
}

/**
 * Get NFL bye week schedule (2025)
 */
export function getNFLSchedule(): Record<string, number[]> {
  return {
    ARI: [8],
    ATL: [5],
    BAL: [7],
    BUF: [7],
    CAR: [14],
    CHI: [5],
    CIN: [10],
    CLE: [9],
    DAL: [10],
    DEN: [12],
    DET: [8],
    GB: [5],
    HOU: [6],
    IND: [11],
    JAX: [8],
    KC: [10],
    LV: [8],
    LAC: [12],
    LAR: [8],
    MIA: [12],
    MIN: [6],
    NE: [14],
    NO: [11],
    NYG: [14],
    NYJ: [9],
    PHI: [9],
    PIT: [5],
    SF: [14],
    SEA: [8],
    TB: [9],
    TEN: [10],
    WAS: [12],
  }
}

/**
 * Fetch league scoring settings
 */
export async function getLeagueScoring(leagueId: string): Promise<Scoring> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`)
  if (!res.ok) throw new Error(`Failed to fetch league scoring: ${res.status}`)
  const json = await res.json()
  return json.scoring_settings ?? {}
}

/**
 * Fetch weekly stats for a specific week
 */
export async function getWeeklyStats(
  year: number,
  week: number
): Promise<Array<{ player_id: string; stats: Record<string, number> }>> {
  const res = await fetch(`${SLEEPER_API_BASE}/stats/nfl/regular/${year}/${week}`)
  if (!res.ok) throw new Error(`Failed to fetch weekly stats: ${res.status}`)

  const data = await res.json()
  return Object.entries(data).map(([playerId, stats]) => ({
    player_id: playerId,
    stats: stats as Record<string, number>,
  }))
}

/**
 * Calculate prior year PPG for a list of players
 */
export async function getPriorYearPPGForPlayers(
  leagueId: string,
  playerIds: string[],
  year: number
): Promise<Array<{ playerId: string; year: number; games: number; ppg: number }>> {
  const scoring = await getLeagueScoring(leagueId)
  const target = new Set(playerIds)

  const agg = new Map<string, { total: number; games: number }>()
  for (let wk = 1; wk <= WEEKS.length; wk++) {
    try {
      const weekly = await getWeeklyStats(year, wk)
      for (const row of weekly) {
        if (!target.has(row.player_id)) continue
        const stats = row.stats ?? {}
        const pts = Object.entries(scoring).reduce((sum, [k, v]) => sum + ((stats as Record<string, number>)[k] ?? 0) * v, 0)
        if (pts === 0 && !row.stats) continue
        const cur = agg.get(row.player_id) ?? { total: 0, games: 0 }
        agg.set(row.player_id, { total: cur.total + pts, games: cur.games + 1 })
      }
    } catch {
      // Skip failed weeks
    }
  }

  return playerIds.map((id) => {
    const a = agg.get(id) ?? { total: 0, games: 0 }
    const ppg = a.games > 0 ? a.total / a.games : 0
    return { playerId: id, year, games: a.games, ppg }
  })
}

/**
 * Fetch Sleeper projections for a specific week
 */
export async function getSleeperProjections(
  week: number,
  season: number
): Promise<SleeperProjection[]> {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'DB', 'LB']
  const positionParams = positions.map((pos) => `position[]=${pos}`).join('&')
  const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&${positionParams}`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.error(`Sleeper projections API error: ${response.status} ${response.statusText}`)
      return []
    }

    const json = await response.json()
    return json as SleeperProjection[]
  } catch (error) {
    console.error('Sleeper projections error:', error)
    return []
  }
}

/**
 * Fetch week team stats
 */
export async function getWeekTeamStats(
  week: number,
  year: number = CURRENT_YEAR
): Promise<Record<string, Record<string, number>>> {
  const url = `${SLEEPER_API_BASE}/stats/nfl/regular/${year}/${week}?season_type=regular&position[]=T`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.error(`Team stats API error: ${response.status} ${response.statusText}`)
      return {}
    }

    return (await response.json()) as Record<string, Record<string, number>>
  } catch (error) {
    console.error('Team stats error:', error)
    return {}
  }
}

/**
 * Fetch KeepTradeCut player values by scraping their rankings page
 */
export async function getKTCValues(playersMeta?: MetaMap): Promise<Record<string, number>> {
  try {
    console.log('Fetching KeepTradeCut player values...')

    // Fetch KTC rankings page
    const res = await fetch('https://keeptradecut.com/dynasty-rankings')

    if (!res.ok) {
      throw new Error(`KTC page returned ${res.status}: ${res.statusText}`)
    }

    const html = await res.text()

    // KTC embeds player data in: var playersArray = [{...}];
    const playersArrayMatch = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/)

    if (!playersArrayMatch) {
      throw new Error('Could not find playersArray in KTC page')
    }

    // Parse the JSON array
    const ktcPlayers = JSON.parse(playersArrayMatch[1]) as Array<{
      playerName: string
      superflexValues?: { value: number }
    }>

    // Get Sleeper player metadata for name matching
    const sleeperPlayers = playersMeta ?? (await getPlayersMeta())

    // Build name-to-value map from KTC
    const ktcNameMap: Record<string, number> = {}
    for (const player of ktcPlayers) {
      if (player.playerName && player.superflexValues?.value) {
        const normalizedName = player.playerName.toLowerCase().trim()
        ktcNameMap[normalizedName] = player.superflexValues.value
      }
    }

    // Helper function to normalize names by removing common suffixes
    const removeCommonSuffixes = (name: string): string => {
      return name
        .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
        .toLowerCase()
        .trim()
    }

    // Match Sleeper players to KTC values by name
    const valueMap: Record<string, number> = {}
    let matchCount = 0
    let fuzzyMatchCount = 0

    for (const [sleeperId, sleeperPlayer] of Object.entries(sleeperPlayers)) {
      if (!sleeperPlayer || typeof sleeperPlayer !== 'object') continue

      const fullName = sleeperPlayer.full_name
      if (!fullName) continue

      const normalizedName = fullName.toLowerCase().trim()

      // Try exact match first
      if (ktcNameMap[normalizedName]) {
        valueMap[sleeperId] = ktcNameMap[normalizedName]
        matchCount++
        continue
      }

      // Try fuzzy match by removing suffixes from both names
      const nameWithoutSuffix = removeCommonSuffixes(fullName)
      for (const [ktcName, value] of Object.entries(ktcNameMap)) {
        const ktcWithoutSuffix = removeCommonSuffixes(ktcName)
        if (nameWithoutSuffix === ktcWithoutSuffix && nameWithoutSuffix.length > 0) {
          valueMap[sleeperId] = value
          matchCount++
          fuzzyMatchCount++
          break
        }
      }
    }

    console.log(
      `Matched ${matchCount} players between KTC and Sleeper (${fuzzyMatchCount} fuzzy matches)`
    )
    return valueMap
  } catch (error) {
    console.error('Failed to fetch KTC values:', error)
    return {}
  }
}

/**
 * Load all league data at once
 */
export async function loadLeagueData(leagueId: string): Promise<{
  league: SleeperLeague
  rosters: SleeperRoster[]
  users: SleeperUser[]
  playersMeta: MetaMap
}> {
  const [league, rosters, users, playersMeta] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
    getPlayersMeta(),
  ])

  return { league, rosters, users, playersMeta }
}

/**
 * Fetch all rostered player normalized names for a league.
 * Returns a Set of normalized names (via normalizeName) for every player
 * on any roster in the league. Used for display-only filtering.
 */
export async function getRosteredPlayerNames(leagueId: string): Promise<Set<string>> {
  const [rosters, playersMeta] = await Promise.all([
    getRosters(leagueId),
    getPlayersMeta(),
  ])

  const rosteredIds = new Set<string>()
  for (const roster of rosters) {
    if (roster.players) {
      for (const pid of roster.players) {
        rosteredIds.add(pid)
      }
    }
  }

  const names = new Set<string>()
  for (const pid of rosteredIds) {
    const meta = playersMeta[pid]
    if (meta?.full_name) {
      names.add(normalizeName(meta.full_name))
    }
  }

  return names
}

export { CURRENT_YEAR, WEEKS }

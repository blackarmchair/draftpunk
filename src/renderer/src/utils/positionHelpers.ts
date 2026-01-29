/**
 * Position-specific helper functions and constants
 */

import type { PlayerProjection, Scoring } from '../types'

/**
 * Flex positions map - defines which positions are eligible for each flex slot
 */
export const FLEX_MAP: Record<string, Set<string>> = {
  WRRB: new Set(['WR', 'RB']),
  WRRBTE: new Set(['WR', 'RB', 'TE']),
  FLEX: new Set(['WR', 'RB', 'TE']),
  SUPER_FLEX: new Set(['QB', 'WR', 'RB', 'TE']),
}

/**
 * Count the number of slots for each position in roster settings
 */
export function countSlots(rosterPositions: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  const arr = Array.isArray(rosterPositions) ? rosterPositions : []

  for (const s of arr) {
    if (s === 'BN' || s === 'IR' || s === 'TAXI') continue
    counts[s] = (counts[s] || 0) + 1
  }
  return counts
}

/**
 * Get typical average points per game by position (PPR scoring)
 * Used as baseline for regression to mean
 */
export function getPositionAverage(position: string): number {
  const positionAverages: Record<string, number> = {
    QB: 18,
    RB: 12,
    WR: 11,
    TE: 9,
    K: 8,
    DST: 8,
  }
  return positionAverages[position] || 10
}

/**
 * Get position volatility factor
 * Higher values indicate more game-to-game variance
 * @param position - Player position
 * @returns Volatility multiplier (1.0 = baseline)
 */
export function getPositionVolatility(position: string): number {
  const volatility: Record<string, number> = {
    QB: 0.85, // Most consistent
    RB: 1.0, // Baseline
    WR: 1.15, // More volatile
    TE: 1.2, // Most volatile (except top tier)
    K: 1.3,
    DST: 1.25,
  }
  return volatility[position] || 1.0
}

/**
 * Get position baseline for PWOPR regression
 * Specific to WR/RB/TE positions
 */
export function getPositionBaseline(position: string): number {
  const positionBaselines: Record<string, number> = {
    WR: 11.5,
    RB: 10.5,
    TE: 8.5,
  }
  return positionBaselines[position] || 10
}

/**
 * Apply position-based regression to mean to prevent extreme outliers
 * @param pwopr - Current PWOPR value
 * @param position - Player position
 * @param confidence - Confidence in the projection (0-1)
 * @returns Adjusted PWOPR value
 */
export function applyPositionBasedRegression(
  pwopr: number,
  position: string,
  confidence: number
): number {
  const baseline = getPositionBaseline(position)
  const regressionFactor = 0.15 * (1 - confidence)

  return pwopr + regressionFactor * (baseline - pwopr)
}

/**
 * Sort by projection descending
 */
export function byProjectionDesc(a: PlayerProjection, b: PlayerProjection): number {
  return b.proj - a.proj
}

/**
 * Pick the best ball lineup for each slot
 * Greedy algorithm that selects highest-projected players for each position
 */
export function pickBestBall(points: PlayerProjection[], slots: Record<string, number>): number {
  const used = new Set<string>()
  let total = 0

  const takeTop = (eligiblePositions: Set<string>, n: number) => {
    const pool = points
      .filter((p) => !used.has(p.player_id) && eligiblePositions.has(p.pos))
      .sort(byProjectionDesc)
      .slice(0, n)
    for (const p of pool) {
      used.add(p.player_id)
      total += p.proj
    }
  }

  // 1) Fixed Slots
  const fixedOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
  for (const slot of fixedOrder) {
    const n = slots[slot] || 0
    if (!n) continue
    takeTop(new Set([slot]), n)
  }

  // 2) Flex Slots (tightest -> loosest)
  const flexOrder = ['WRRB', 'WRRBTE', 'FLEX', 'SUPER_FLEX']
  for (const slot of flexOrder) {
    const n = slots[slot] || 0
    if (!n) continue
    takeTop(FLEX_MAP[slot as keyof typeof FLEX_MAP], n)
  }

  return total
}

/**
 * Extract PPR projection from various possible data formats
 */
export function projPPR(p: Record<string, unknown>): number {
  // direct top-level fields frequently seen across feeds
  const direct =
    (p.pts_ppr as number) ??
    (p.fp_ppr as number) ??
    (p.ppr as number) ??
    (p.fantasy_points_ppr as number) ??
    (p.points_ppr as number) ??
    (p.proj_ppr as number) ??
    (p.pts as number)
  if (direct != null) return Number(direct)

  // nested containers some feeds use
  const s = (p.stats || p.projections || p.proj || {}) as Record<string, unknown>
  return Number((s.pts_ppr as number) ?? (s.fp_ppr as number) ?? 0) || 0
}

/**
 * Calculate player score based on stats and scoring settings
 */
export function scorePlayer(stats: Record<string, number>, scoring: Scoring): number {
  let pts = 0
  for (const k in scoring) {
    const v = stats[k] ?? 0
    if (typeof v === 'number') pts += v * scoring[k]
  }
  return pts
}

/**
 * Get position color for UI display
 */
export function getPositionColor(position: string): string {
  const colors: Record<string, string> = {
    QB: '#ff6b9d',
    RB: '#4ecdc4',
    WR: '#45b7d1',
    TE: '#f7dc6f',
    K: '#bb8fce',
    DST: '#85c1e9',
  }
  return colors[position] || '#ffffff'
}

/**
 * Get tier label based on score thresholds
 */
export function getTierLabel(
  score: number,
  position: string,
  thresholds: { elite: number; tier1: number; tier2: number; tier3: number; flex: number }
): string {
  if (score >= thresholds.elite) return 'Elite'
  if (score >= thresholds.tier1) return `${position}1`
  if (score >= thresholds.tier2) return `${position}2`
  if (score >= thresholds.tier3) return `${position}3`
  if (score >= thresholds.flex) return 'Flex'
  return 'Bench'
}

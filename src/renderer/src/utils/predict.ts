/**
 * PWOPR prediction scoring model
 * Uses linear regression to predict fantasy points based on PWOPR values
 */

import type { WoprRow, ScoredWoprRow } from '../types'

type Fit = { a: number; b: number; r2: number; n: number }
type Signal = 'Over (Strong)' | 'Over' | 'Neutral' | 'Under' | 'Under (Strong)'

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

/**
 * Fit a linear regression model to the data
 * Returns coefficients a (intercept) and b (slope), plus r2 and sample size
 */
function fitLinear(xs: number[], ys: number[]): Fit | undefined {
  const n = xs.length
  if (n < 8) return undefined

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0,
    sumYY = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i],
      y = ys[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
    sumYY += y * y
  }
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return undefined

  const b = (n * sumXY - sumX * sumY) / denom
  const a = (sumY - b * sumX) / n

  // r^2 for sanity
  const ssTot = sumYY - (sumY * sumY) / n
  const ssRes = ssTot - b * (sumXY - (sumX * sumY) / n)
  const r2 = ssTot > 1e-9 ? clamp(1 - ssRes / ssTot, 0, 1) : 0

  return { a, b, r2, n }
}

/**
 * Build training data for regression model
 */
function buildTraining(history: WoprRow[], pos?: WoprRow['pos']) {
  const rows = pos ? history.filter((r) => r.pos === pos) : history.slice()
  const xs = rows.map((r) => r.pwopr)
  const ys = rows.map((r) => r.pts_ppr ?? 0)
  return { xs, ys, n: rows.length }
}

export interface ScoreWithPWOPROptions {
  perPosition?: boolean // default true
  strongThreshold?: number // points above/below projection to call "Strong"
  weakThreshold?: number // points above/below projection to call normal o/u
  minByPosSamples?: number // fallback to global if pos-fit too small
  capExpected?: [number, number] // sanity clamp on Expected points
}

/**
 * Score players using PWOPR prediction model
 * Uses historical PWOPR-to-points relationship to predict expected fantasy points
 * and compare against external projections
 *
 * @param history - Historical WOPR data for model training
 * @param upcoming - Current week players to score
 * @param opts - Configuration options
 * @returns Scored rows with expected points and signals
 */
export function scoreWithPWOPR(
  history: WoprRow[],
  upcoming: WoprRow[],
  opts?: ScoreWithPWOPROptions
): ScoredWoprRow[] {
  const {
    perPosition = true,
    strongThreshold = 4.0,
    weakThreshold = 1.5,
    minByPosSamples = 12,
    capExpected = [-5, 45],
  } = opts ?? {}

  // Global fit
  const gTrain = buildTraining(history)
  const gFit = fitLinear(gTrain.xs, gTrain.ys)

  // Position fits
  const posFit: Partial<Record<WoprRow['pos'], Fit | undefined>> = {}
  if (perPosition) {
    ;(['QB', 'RB', 'WR', 'TE'] as const).forEach((p) => {
      const t = buildTraining(history, p)
      posFit[p] = t.n >= minByPosSamples ? fitLinear(t.xs, t.ys) : undefined
    })
  }

  // Helper to choose model for a row
  function chooseFit(row: WoprRow): { fit: Fit; tag: 'global' | 'byPos' } {
    const pf = perPosition ? posFit[row.pos] : undefined
    if (pf && pf.n >= minByPosSamples && pf.r2 >= (gFit?.r2 ?? 0) - 0.03) {
      return { fit: pf, tag: 'byPos' }
    }
    return { fit: gFit!, tag: 'global' }
  }

  // Build scored output
  return upcoming.map((row) => {
    const { fit, tag } = chooseFit(row)
    let expected = fit ? fit.a + fit.b * row.pwopr : row.fantasyProjection ?? 0
    expected = clamp(expected, capExpected[0], capExpected[1])

    const delta = expected - (row.fantasyProjection ?? 0)

    let signal: Signal = 'Neutral'
    // Default to Neutral if either projection or expected is 0 (missing data)
    if ((row.fantasyProjection ?? 0) === 0 || expected === 0) {
      signal = 'Neutral'
    } else if (delta >= strongThreshold) {
      signal = 'Over (Strong)'
    } else if (delta >= weakThreshold) {
      signal = 'Over'
    } else if (delta <= -strongThreshold) {
      signal = 'Under (Strong)'
    } else if (delta <= -weakThreshold) {
      signal = 'Under'
    }

    return {
      ...row,
      expected: round(expected, 2),
      deltaExpVsProj: round(delta, 2),
      signal,
      model: tag,
      modelN: fit?.n ?? 0,
      modelR2: round(fit?.r2 ?? 0, 3),
    }
  })
}

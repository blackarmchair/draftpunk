/**
 * Mathematical helper functions for statistical analysis and projections
 */

/**
 * Calculate trend using linear regression on performance data
 * Returns slope indicating if player is trending up (positive) or down (negative)
 */
export function calculateTrend(values: number[]): number {
  if (values.length < 3) return 0
  const n = values.length
  const xSum = (n * (n - 1)) / 2 // Sum of 0,1,2,...,n-1
  const ySum = values.reduce((a, b) => a + b, 0)
  const xySum = values.reduce((sum, y, x) => sum + x * y, 0)
  const xSquareSum = (n * (n - 1) * (2 * n - 1)) / 6

  const denominator = n * xSquareSum - xSum * xSum
  if (denominator === 0) return 0

  const slope = (n * xySum - xSum * ySum) / denominator
  return slope
}

/**
 * Calculate exponential weighted moving average
 * Gives more weight to recent performances
 * @param values - Array of numeric values
 * @param alpha - Smoothing factor (0-1), default 0.3. Higher = more weight to recent values
 */
export function calculateEWMA(values: number[], alpha: number = 0.3): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  let ewma = values[0]
  for (let i = 1; i < values.length; i++) {
    ewma = alpha * values[i] + (1 - alpha) * ewma
  }
  return ewma
}

/**
 * Apply regression to mean to prevent extreme outlier projections
 * Pulls extreme values slightly toward a baseline
 * @param projection - The current projection value
 * @param baseline - The baseline to regress toward
 * @param factor - Regression strength (0-1), default 0.12. Higher = more regression
 */
export function applyRegressionToMean(
  projection: number,
  baseline: number,
  factor: number = 0.12
): number {
  return projection + factor * (baseline - projection)
}

/**
 * Get confidence multiplier based on sample size
 * More games = higher confidence in historical data
 * @param sampleSize - Number of games/data points
 * @returns Confidence score between 0 and 1
 */
export function getSampleSizeConfidence(sampleSize: number): number {
  if (sampleSize >= 8) return 1.0 // Full confidence
  if (sampleSize >= 5) return 0.9 // 90% confidence
  if (sampleSize >= 3) return 0.75 // 75% confidence
  if (sampleSize >= 1) return 0.5 // 50% confidence
  return 0.25 // 25% confidence (no data)
}

/**
 * Calculate time decay weight for historical data
 * More recent data points get higher weights
 * @param weeksAgo - How many weeks in the past
 * @param decayRate - Decay rate (default 0.1). Higher = faster decay
 */
export function calculateTimeWeight(weeksAgo: number, decayRate: number = 0.1): number {
  return Math.exp(-decayRate * weeksAgo)
}

/**
 * Safe division that returns 0 when dividing by 0
 */
export function safeDiv(n: number, d: number): number {
  return d > 0 ? n / d : 0
}

/**
 * Clamp a value between 0 and 1
 */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Check if value is a finite number
 */
export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/**
 * Check if value is a finite positive number
 */
export function isFinitePositiveNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0
}

/**
 * Calculate variance of an array of numbers
 */
export function calculateVariance(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[]): number {
  return Math.sqrt(calculateVariance(values))
}

/**
 * Make an empirical CDF function from a list of values
 */
export function makeECDF(vals: number[]): (v: number) => number {
  const arr = vals
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b)

  return (v: number) => {
    if (!arr.length) return 0.5
    const lo = arr[0],
      hi = arr[arr.length - 1]
    const x = Math.min(hi, Math.max(lo, v))
    let l = 0,
      r = arr.length - 1
    while (l <= r) {
      const m = (l + r) >> 1
      if (arr[m] < x) l = m + 1
      else r = m - 1
    }
    const q = l / arr.length
    return Math.max(0, Math.min(1, q))
  }
}

/**
 * Get quantile value from sorted array
 */
export function quantile(arr: number[], q: number): number {
  if (!arr.length) return 0
  const i = Math.min(arr.length - 1, Math.max(0, Math.round(q * (arr.length - 1))))
  return arr[i]
}

/**
 * Map metric x in [lo,hi] to the same percentile in the priorPPGs distribution
 */
export function mapToPPGByPercentile(
  x: number,
  lo: number,
  hi: number,
  priorPPGs: number[]
): number {
  const q = (Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo || 1)
  return quantile(priorPPGs, q)
}

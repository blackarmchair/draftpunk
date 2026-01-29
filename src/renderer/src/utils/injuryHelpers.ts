/**
 * Injury-related helper functions for player projections
 */

/**
 * Get probability that a player will play based on injury status
 * @param injuryStatus - Player's injury designation (IR, Out, Doubtful, Questionable, Probable, or null for healthy)
 * @returns Probability between 0 (definitely out) and 1 (definitely plays)
 */
export function getInjuryProbability(injuryStatus: string | null): number {
  const probabilities: Record<string, number> = {
    IR: 0, // Definitely out
    Out: 0, // Definitely out
    Doubtful: 0.15, // ~15% chance to play
    Questionable: 0.65, // ~65% chance to play
    Probable: 0.9, // ~90% chance to play
  }
  return probabilities[injuryStatus || ''] ?? 1.0 // Null/undefined = healthy = 100%
}

/**
 * Get performance impact multiplier if player plays while injured
 * Even if a player plays, injuries can reduce their effectiveness
 * @param injuryStatus - Player's injury designation
 * @returns Performance multiplier between 0 and 1
 */
export function getInjuryImpact(injuryStatus: string | null): number {
  const impactFactors: Record<string, number> = {
    Doubtful: 0.6, // 40% reduction if they do play
    Questionable: 0.85, // 15% reduction
    Probable: 0.95, // 5% reduction
  }
  return impactFactors[injuryStatus || ''] ?? 1.0 // Null = no impact
}

/**
 * Calculate combined injury adjustment for a projection
 * Combines both probability of playing and performance impact
 * @param projection - Base projection without injury adjustment
 * @param injuryStatus - Player's injury designation
 * @returns Adjusted projection accounting for injury risk
 */
export function applyInjuryAdjustment(projection: number, injuryStatus: string | null): number {
  const probability = getInjuryProbability(injuryStatus)
  const impact = getInjuryImpact(injuryStatus)
  return projection * probability * impact
}

/**
 * Get display text for injury status
 */
export function getInjuryStatusDisplay(injuryStatus: string | null): string {
  if (!injuryStatus) return ''
  return injuryStatus
}

/**
 * Get CSS class for injury status styling
 */
export function getInjuryStatusClass(injuryStatus: string | null): string {
  if (!injuryStatus) return ''
  const statusClasses: Record<string, string> = {
    IR: 'injury-ir',
    Out: 'injury-out',
    Doubtful: 'injury-doubtful',
    Questionable: 'injury-questionable',
    Probable: 'injury-probable',
  }
  return statusClasses[injuryStatus] || ''
}

/**
 * Normalizes a player name for matching purposes
 * - Lowercases
 * - Trims
 * - Removes all punctuation and special characters
 * - Collapses whitespace
 * - Removes common suffixes: jr, sr, ii, iii, iv
 */
export function normalizeName(name: string): string {
  if (!name) return ''

  let normalized = name
    .toLowerCase()
    .trim()
    // Remove all punctuation and special characters (keep letters, numbers, spaces)
    .replace(/[^a-z0-9\s]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()

  // Remove common suffixes
  const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'v']
  const words = normalized.split(' ')
  const lastWord = words[words.length - 1]

  if (suffixes.includes(lastWord)) {
    words.pop()
    normalized = words.join(' ').trim()
  }

  return normalized
}

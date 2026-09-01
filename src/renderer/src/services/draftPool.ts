import { normalizeName } from '../utils/normalizeName'
import { applyAlias } from '../data/aliases'

/**
 * Draft pool: which players are actually eligible in the draft being graded.
 *
 * This matters because the grader compares two counts that must be drawn from
 * the SAME universe: how many players at a position have come off the board,
 * and where the pick sits on the user's sheet at that position.
 *
 * A dynasty overall sheet interleaves rookies with veterans, so in a rookie
 * draft those universes diverge — the 1st rookie WR off the board might be WR10
 * on the sheet, scoring as a nine-slot reach when it was the correct pick. The
 * pool restricts the sheet to eligible players so both counts line up again.
 */

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'
const CACHE_KEY = 'draft-punk-rookie-pool'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Positions the grader scores; the pool never needs anyone else. */
const POOL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

export type DraftPool = 'all' | 'rookies'

export const DRAFT_POOLS: ReadonlyArray<{ key: DraftPool; label: string; hint: string }> = [
  { key: 'all', label: 'All players (startup)', hint: 'Rank against your whole sheet' },
  { key: 'rookies', label: 'Rookies only', hint: 'Rank against rookies on your sheet' }
]

interface CachedPool {
  names: string[]
  fetchedAt: string
}

interface SleeperPlayerMeta {
  full_name?: string
  first_name?: string
  last_name?: string
  position?: string
  years_exp?: number
}

function playerName(meta: SleeperPlayerMeta): string {
  if (meta.full_name) return meta.full_name
  const parts = [meta.first_name, meta.last_name].filter(Boolean)
  return parts.join(' ')
}

/**
 * Fetch the rookie name set from Sleeper.
 *
 * The players endpoint is ~15MB, so only the derived name set is cached — never
 * the raw payload — and this is only called when rookie grading is selected.
 */
export async function fetchRookieNames(signal?: AbortSignal): Promise<Set<string>> {
  const response = await fetch(`${SLEEPER_API_BASE}/players/nfl`, { signal })
  if (!response.ok) {
    throw new Error(`Sleeper players ${response.status}: ${response.statusText}`)
  }

  const players = (await response.json()) as Record<string, SleeperPlayerMeta>
  const names = new Set<string>()

  for (const meta of Object.values(players)) {
    if (meta?.years_exp !== 0) continue
    if (!POOL_POSITIONS.has((meta.position || '').toUpperCase())) continue

    const name = playerName(meta)
    if (!name) continue

    // Same normalization pipeline the sheet and the picks use.
    names.add(applyAlias(normalizeName(name)))
  }

  if (!names.size) {
    throw new Error('Sleeper returned no rookies')
  }

  return names
}

function readCache(): Set<string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedPool
    const age = Date.now() - new Date(cached.fetchedAt).getTime()
    if (!Number.isFinite(age) || age > CACHE_TTL_MS) return null
    if (!cached.names?.length) return null

    return new Set(cached.names)
  } catch {
    return null
  }
}

function writeCache(names: Set<string>): void {
  try {
    const payload: CachedPool = { names: [...names], fetchedAt: new Date().toISOString() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Cache is an optimization, not a requirement.
  }
}

export async function getRookieNames(
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<Set<string>> {
  if (!options.force) {
    const cached = readCache()
    if (cached) return cached
  }

  const fresh = await fetchRookieNames(options.signal)
  writeCache(fresh)
  return fresh
}

/**
 * Fraction of graded-position picks in this draft that are rookies.
 * Used to notice when the selected pool disagrees with what is being drafted.
 */
export function rookieShare(
  pickNames: Array<{ name: string; position: string }>,
  rookieNames: Set<string>
): number {
  const eligible = pickNames.filter(p => POOL_POSITIONS.has(p.position.toUpperCase()))
  if (!eligible.length) return 0

  const rookies = eligible.filter(p => rookieNames.has(applyAlias(normalizeName(p.name))))
  return rookies.length / eligible.length
}

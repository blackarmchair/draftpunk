/**
 * RosterAudit dynasty value feed.
 *
 * Supplies the VALUE CURVE that the pick grader uses to space rank slots. The
 * grader consumes only the shape of these curves indexed by positional rank —
 * never an individual player's market value — so the user's ranking sheet
 * remains the sole authority on ordering. See draftGrade.ts.
 *
 * Only the two public, non-identifying endpoints are used. /trade/calculate,
 * /projections/roster-grades and /league-history/* all transmit league and
 * roster data to a third party and are deliberately not called.
 *
 * Attribution is a condition of use: any UI showing these values must display
 * a visible link back to rosteraudit.com.
 */

const BASE = 'https://rosteraudit.com/wp-json/ra/v1'
const CACHE_KEY = 'draft-punk-rosteraudit-curves'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/** Positions we build curves for, matching the grader. */
const CURVE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

export type RosterAuditFormat = 'sf_ppr' | '1qb_ppr' | 'sf_half' | '1qb_half' | 'sf_ppr_tep'

export const ROSTER_AUDIT_FORMATS: ReadonlyArray<{ key: RosterAuditFormat; label: string }> = [
  { key: 'sf_ppr', label: 'Superflex PPR' },
  { key: 'sf_ppr_tep', label: 'Superflex PPR (TE Premium)' },
  { key: 'sf_half', label: 'Superflex 0.5 PPR' },
  { key: '1qb_ppr', label: '1QB PPR' },
  { key: '1qb_half', label: '1QB 0.5 PPR' }
]

export const ATTRIBUTION_FALLBACK = 'Values by RosterAudit.com'
export const ATTRIBUTION_URL_FALLBACK = 'https://rosteraudit.com'

/** One pool's curves: values by positional slot, plus the overall ordering. */
export interface PoolCurves {
  /** position -> value at positional slot N, stored at index N-1, descending. */
  byPosition: Record<string, number[]>
  /** Every value in this pool across positions, descending. */
  overall: number[]
}

export interface ValueCurves {
  format: RosterAuditFormat
  /** Curves over every player. */
  all: PoolCurves
  /** Curves restricted to rookies, for grading a rookie draft. */
  rookies: PoolCurves
  /** Rookie draft pick number -> value. Index N-1 = pick N. */
  pickCurve: number[]
  /**
   * Highest value on the whole board. Both pools normalize against this same
   * number so a rookie-draft score stays on the same scale as a startup score
   * rather than being inflated against the best rookie.
   */
  topValue: number
  fetchedAt: string
  attribution: string
  attributionUrl: string
}

interface RankingsResponse {
  players?: Array<{
    rank_pos?: string | number
    value?: string | number
    position?: string
    years_exp?: string | number
  }>
}

interface PicksResponse {
  pick_curve_sf?: Record<string, number>
  pick_curve_1qb?: Record<string, number>
  attribution?: string
  attribution_url?: string
}

/**
 * The renderer cannot set User-Agent (a forbidden header for fetch), but
 * Electron's default agent is descriptive and is not one of the blocked
 * default curl/python agents.
 */
async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`RosterAudit ${response.status}: ${response.statusText}`)
  }
  return (await response.json()) as T
}

function isSuperflex(format: RosterAuditFormat): boolean {
  return format.startsWith('sf')
}

/** Turn `{ "1": 5166, "2": 4518 }` into a dense array indexed by pick number - 1. */
function pickCurveToArray(curve: Record<string, number> | undefined): number[] {
  if (!curve) return []
  const entries = Object.entries(curve)
    .map(([slot, value]) => [Number(slot), Number(value)] as const)
    .filter(([slot, value]) => Number.isFinite(slot) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0])

  const out: number[] = []
  for (const [slot, value] of entries) out[slot - 1] = value
  return out
}

export async function fetchValueCurves(
  format: RosterAuditFormat,
  signal?: AbortSignal
): Promise<ValueCurves> {
  const positionRequests = CURVE_POSITIONS.map(async position => {
    const url = `${BASE}/rankings?format_key=${encodeURIComponent(
      format
    )}&position=${position}&per_page=500`
    const data = await getJSON<RankingsResponse>(url, signal)
    const ranked = (data.players ?? [])
      .map(p => ({
        rank: Number(p.rank_pos),
        value: Number(p.value),
        rookie: Number(p.years_exp) === 0
      }))
      .filter(p => Number.isFinite(p.rank) && Number.isFinite(p.value))
      .sort((a, b) => a.rank - b.rank)

    return {
      position,
      all: ranked.map(p => p.value),
      // Re-densified: the Nth best rookie at this position sits at index N-1.
      rookies: ranked.filter(p => p.rookie).map(p => p.value)
    }
  })

  const picksRequest = getJSON<PicksResponse>(`${BASE}/picks`, signal)
  const [positionResults, picksData] = await Promise.all([
    Promise.all(positionRequests),
    picksRequest
  ])

  const buildPool = (pick: 'all' | 'rookies'): PoolCurves => {
    const byPosition: Record<string, number[]> = {}
    for (const result of positionResults) {
      byPosition[result.position] = result[pick]
    }
    return {
      byPosition,
      overall: Object.values(byPosition)
        .flat()
        .sort((a, b) => b - a)
    }
  }

  const all = buildPool('all')
  const rookies = buildPool('rookies')

  const topValue = all.overall[0] ?? 0
  if (!topValue) {
    throw new Error('RosterAudit returned no usable values')
  }

  return {
    format,
    all,
    rookies,
    pickCurve: pickCurveToArray(
      isSuperflex(format) ? picksData.pick_curve_sf : picksData.pick_curve_1qb
    ),
    topValue,
    fetchedAt: new Date().toISOString(),
    attribution: picksData.attribution || ATTRIBUTION_FALLBACK,
    attributionUrl: picksData.attribution_url || ATTRIBUTION_URL_FALLBACK
  }
}

export function readCachedCurves(format: RosterAuditFormat): ValueCurves | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const cached = JSON.parse(raw) as ValueCurves
    if (cached.format !== format) return null
    if (!cached.topValue || !cached.all?.byPosition || !cached.rookies?.byPosition) return null

    return cached
  } catch {
    return null
  }
}

export function isStale(curves: ValueCurves): boolean {
  const age = Date.now() - new Date(curves.fetchedAt).getTime()
  return !Number.isFinite(age) || age > CACHE_TTL_MS
}

function writeCachedCurves(curves: ValueCurves): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(curves))
  } catch {
    // Cache is an optimization; a full quota is not a draft-stopping problem.
  }
}

/**
 * Cache-first curve load. Returns cached values immediately when fresh, and
 * only reaches the network when the cache is missing, stale, or force-refreshed.
 */
export async function getValueCurves(
  format: RosterAuditFormat,
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<ValueCurves> {
  if (!options.force) {
    const cached = readCachedCurves(format)
    if (cached && !isStale(cached)) return cached
  }

  const fresh = await fetchValueCurves(format, options.signal)
  writeCachedCurves(fresh)
  return fresh
}

/**
 * Pick a RosterAudit format from a Sleeper league's roster_positions.
 * Returns null when there is nothing to infer from, so the caller can keep
 * whatever the user chose.
 */
export function inferFormat(rosterPositions: string[] | undefined): RosterAuditFormat | null {
  if (!rosterPositions?.length) return null
  const superflex = rosterPositions.some(p => p === 'SUPER_FLEX' || p === 'SUPERFLEX')
  return superflex ? 'sf_ppr' : '1qb_ppr'
}

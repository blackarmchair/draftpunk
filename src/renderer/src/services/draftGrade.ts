import { DraftPick, RankingRow } from '../types'
import { normalizeName } from '../utils/normalizeName'
import { applyAlias } from '../data/aliases'
import { ValueCurves } from './rosterAudit'
import { DraftPool } from './draftPool'

/**
 * Draft pick grading.
 *
 * A pick is graded on its POSITIONAL ORDER DIFFERENTIAL: how far a player fell
 * (or was reached for) relative to where the user's sheet ranks him within his
 * own position. "He was the 8th RB off the board; your sheet has him RB3" is a
 * +5 differential.
 *
 * This only ever asks the ranking sheet a question it can actually answer. The
 * sheet ranks players within a position, so the grader never has to invent a
 * cross-position value scale to compare a QB against a WR.
 *
 * Two scoring modes turn that differential into a score:
 *
 *   'sheet-order'  Ordinal only. The differential is dampened by sqrt(rank) to
 *                  approximate the fact that early rank slots are worth more
 *                  than late ones. Needs no network and is always available.
 *
 *   'value-curve'  Uses a RosterAudit dynasty value curve for the real spacing
 *                  between slots. IMPORTANT: only the SHAPE of the curve is
 *                  used, indexed by rank slot. Your sheet's RB3 is priced at
 *                  the RB3 slot whoever he is; the market never re-ranks a
 *                  player. Ordering stays entirely yours, only the gaps come
 *                  from outside.
 *
 * This module is read-only over the ranking sheet. It derives grades; it never
 * reorders, rewrites, or feeds anything back into the user's rankings.
 */

/** Positions the grader understands. K and DEF are left ungraded. */
export const GRADED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type GradedPosition = (typeof GRADED_POSITIONS)[number]

const GRADED_POSITION_SET: ReadonlySet<string> = new Set(GRADED_POSITIONS)

export type GradeLetter =
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D'
  | 'F'

export type GradeTone = 'great' | 'good' | 'fair' | 'poor' | 'bad'

export type GradeSource = 'sheet-order' | 'value-curve'

/**
 * Positional rank lookup derived from the ranking sheet:
 * position -> normalized player name -> 1-based rank within that position.
 */
export type PositionalRankIndex = ReadonlyMap<string, ReadonlyMap<string, number>>

export type UngradedReason = 'not-on-sheet' | 'position-not-graded' | 'no-pick-value'

export interface GradedPlayerPick {
  pickNo: number
  graded: true
  kind: 'player'
  position: GradedPosition
  /** Nth player at this position taken in the draft, counting from pick 1. */
  posPick: number
  /** This player's rank within his position on the user's sheet. */
  userRank: number
  /** Positive = fell to a good spot, negative = reach. */
  score: number
  letter: GradeLetter
  source: GradeSource
}

export interface GradedRookiePick {
  pickNo: number
  graded: true
  kind: 'rookie-pick'
  /** Absolute position in the rookie draft this pick represents. */
  rookiePickNumber: number
  /** Curve value of the pick itself. */
  pickValue: number
  /** Value of the best asset normally available at this draft slot. */
  expectedValue: number
  score: number
  letter: GradeLetter
  source: 'value-curve'
}

export type GradedPick = GradedPlayerPick | GradedRookiePick

export interface UngradedPick {
  pickNo: number
  graded: false
  reason: UngradedReason
}

export type PickGrade = GradedPick | UngradedPick

export interface TeamGrade {
  letter: GradeLetter | null
  averageScore: number | null
  /** Picks that matched the sheet and carry a score. */
  gradedCount: number
  /** Every pick the team made, graded or not. Always show this denominator. */
  totalCount: number
}

/**
 * Ordinal mode: rank slots are not equal in value. The gap between RB2 and RB5
 * is real, the gap between RB50 and RB53 is noise in the tail of the sheet.
 * Dividing the raw differential by the square root of the rank dampens
 * deep-board swings without flattening them entirely. The floor keeps the very
 * top of the board from dividing by a number small enough to manufacture an A+
 * out of a single slot.
 */
const RANK_DEPTH_FLOOR = 4

/**
 * Positional depth the grade bands are calibrated against.
 *
 * The bands are absolute slot counts, so they only mean the same thing at the
 * depth they were tuned for. In a 13-deep rookie RB pool an A+ would demand
 * moving 10.8 slots — 83% of the whole position — so every pick collapses into
 * B. Ranks are rescaled into this reference depth before scoring, which makes a
 * grade mean "this far through the position" rather than "this many slots".
 *
 * A ~100-deep pool scales by ~1, so startup grading is materially unchanged.
 * The square root keeps shallow pools from over-correcting into the opposite
 * failure, where any one-slot move would read as an A.
 */
const REFERENCE_POOL_DEPTH = 100

/** Depth below which a pool is too thin for the rescaling to be meaningful. */
const MIN_POOL_DEPTH = 3

/**
 * Curve mode: converts a value surplus (as a fraction of the top asset on the
 * board) onto the same score scale the bands are calibrated for.
 *
 * Derived empirically by matching the ordinal score for a reference event — a
 * 5-slot fall at RB10 — against the same event priced on the live curve. Both
 * modes therefore agree in the middle of the board and diverge only where the
 * curve genuinely disagrees with a sqrt approximation: across tier cliffs near
 * the top, and deep in the flat tail.
 */
const CURVE_SENSITIVITY = 18.75

/**
 * Both modes can produce extreme outliers: a tier cliff on the curve, or a
 * 90-slot reach on sheet order. The bands already saturate well inside this
 * range (A+ at 3.0, F below -4.5), so clamping costs no letter grade — but it
 * keeps one outlier from swamping a team's average.
 */
const SCORE_CLAMP = 6

/**
 * Minimum curve depth before the curve is trusted to price a differential.
 *
 * A curve needs both depth and dynamic range to carry information. RosterAudit's
 * rookie curves are only 10-18 deep per position and flat past the top handful
 * (rookie WR8 through WR18 are worth about the same), so pricing a rookie draft
 * on them collapses nearly every pick to a 0 surplus and grades the whole board
 * B. The full-board curves are 72-100 deep and price fine.
 *
 * This is a data-quality guard rather than a rookie special case: any pool whose
 * curve is too shallow to discriminate falls back to sheet-order scoring, and a
 * deeper rookie curve would start being used automatically.
 */
const MIN_CURVE_DEPTH = 30

/** Lower bound of each grade band, highest first. Anything below the last is F. */
const GRADE_BANDS: ReadonlyArray<readonly [number, GradeLetter]> = [
  [3.0, 'A+'],
  [2.0, 'A'],
  [1.25, 'A-'],
  [0.6, 'B+'],
  // B is deliberately wide and slightly reach-tolerant: taking a player one or
  // two slots ahead of your rank is inside the noise of any ranking sheet and
  // should not read as a mistake.
  [-0.55, 'B'],
  [-1.1, 'B-'],
  [-1.7, 'C+'],
  [-2.4, 'C'],
  [-3.1, 'C-'],
  [-4.5, 'D']
]

const GRADE_TONES: Readonly<Record<GradeLetter, GradeTone>> = {
  'A+': 'great',
  A: 'great',
  'A-': 'great',
  'B+': 'good',
  B: 'good',
  'B-': 'good',
  'C+': 'fair',
  C: 'fair',
  'C-': 'fair',
  D: 'poor',
  F: 'bad'
}

/**
 * Build the positional rank lookup from the user's sheet.
 *
 * The sheet carries no rank column — rank is implied by row order, which the
 * CSV parser preserves. A position's Nth row is that position's rank N.
 *
 * `pool` restricts which sheet rows are eligible, and ranks are re-densified
 * within whatever survives. This is what keeps a rookie draft honest: on a
 * dynasty overall sheet the first rookie WR might be WR10, and grading him
 * against WR10 makes a correct pick look like a nine-slot reach. Restricted to
 * rookies he is WR1, which is the number the draft is actually counting.
 */
export function buildPositionalRankIndex(
  rankings: RankingRow[],
  pool?: ReadonlySet<string> | null
): PositionalRankIndex {
  const index = new Map<string, Map<string, number>>()

  for (const row of rankings) {
    const position = row.position.toUpperCase()
    if (!GRADED_POSITION_SET.has(position)) continue
    if (pool && !pool.has(row.normalizedName)) continue

    let byName = index.get(position)
    if (!byName) {
      byName = new Map<string, number>()
      index.set(position, byName)
    }

    // First listing wins if a name appears twice.
    if (!byName.has(row.normalizedName)) {
      byName.set(row.normalizedName, byName.size + 1)
    }
  }

  return index
}

export function scoreToLetter(score: number): GradeLetter {
  for (const [threshold, letter] of GRADE_BANDS) {
    if (score >= threshold) return letter
  }
  return 'F'
}

export function gradeTone(letter: GradeLetter): GradeTone {
  return GRADE_TONES[letter]
}

function clampScore(score: number): number {
  return Math.max(-SCORE_CLAMP, Math.min(SCORE_CLAMP, score))
}

/**
 * Rescale a rank into the reference depth so the bands mean the same thing in a
 * 13-deep rookie pool as in a 100-deep startup board.
 */
function depthScale(poolDepth: number): number {
  if (poolDepth < MIN_POOL_DEPTH) return 1
  return Math.sqrt(REFERENCE_POOL_DEPTH / poolDepth)
}

function ordinalScore(posPick: number, userRank: number, poolDepth: number): number {
  const scale = depthScale(poolDepth)
  const scaledRank = userRank * scale
  const scaledPick = posPick * scale
  return clampScore(
    (scaledPick - scaledRank) / Math.sqrt(Math.max(scaledRank, RANK_DEPTH_FLOOR))
  )
}

/**
 * Price a rank differential on the value curve. Returns null when either slot
 * falls past the curve's depth, where the values flatten into noise and the
 * ordinal fallback is the more honest answer.
 */
function curveScore(
  curves: ValueCurves,
  pool: DraftPool,
  position: GradedPosition,
  posPick: number,
  userRank: number
): number | null {
  const curve = (pool === 'rookies' ? curves.rookies : curves.all).byPosition[position]
  if (!curve?.length || curve.length < MIN_CURVE_DEPTH) return null
  if (userRank > curve.length || posPick > curve.length) return null

  const surplus = curve[userRank - 1] - curve[posPick - 1]
  if (!Number.isFinite(surplus)) return null

  return clampScore((CURVE_SENSITIVITY * surplus) / curves.topValue)
}

/**
 * Grade a rookie pick asset against the overall value curve.
 *
 * Rookie picks have no position, so unlike players they are scored on the
 * OVERALL axis: the pick's own curve value against the value of the best asset
 * normally available at that point in the draft.
 */
function rookiePickGrade(
  curves: ValueCurves,
  pickNo: number,
  rookiePickNumber: number
): { score: number; pickValue: number; expectedValue: number } | null {
  const pickValue = curves.pickCurve[rookiePickNumber - 1]
  if (pickValue === undefined || !Number.isFinite(pickValue)) return null

  // A rookie pick is an asset in a startup draft, so it is always priced
  // against the full board rather than a restricted pool.
  const overall = curves.all.overall
  const slot = Math.min(pickNo, overall.length)
  const expectedValue = overall[slot - 1]
  if (expectedValue === undefined || !Number.isFinite(expectedValue)) return null

  return {
    score: clampScore((CURVE_SENSITIVITY * (pickValue - expectedValue)) / curves.topValue),
    pickValue,
    expectedValue
  }
}

/**
 * Grade every pick in a draft, keyed by pick number.
 *
 * Single pass in draft order: positional counters are carried forward rather
 * than rescanning the whole pick list once per pick.
 *
 * `curves` is optional. Without it every pick is graded in 'sheet-order' mode,
 * which is also the per-pick fallback whenever a slot sits past the curve's
 * depth — so a feed outage or a deep sheet degrades gracefully mid-draft
 * instead of dropping grades.
 */
export function gradePicks(
  picks: DraftPick[],
  index: PositionalRankIndex,
  curves?: ValueCurves | null,
  pool: DraftPool = 'all'
): Map<number, PickGrade> {
  const grades = new Map<number, PickGrade>()
  const takenAtPosition = new Map<string, number>()

  const ordered = [...picks].sort((a, b) => a.pickNo - b.pickNo)

  for (const pick of ordered) {
    const position = pick.position.toUpperCase()

    if (!GRADED_POSITION_SET.has(position)) {
      // Rookie picks are gradeable, but only on the value curve.
      if (pick.rookiePickNumber && curves) {
        const rookie = rookiePickGrade(curves, pick.pickNo, pick.rookiePickNumber)
        if (rookie) {
          grades.set(pick.pickNo, {
            pickNo: pick.pickNo,
            graded: true,
            kind: 'rookie-pick',
            rookiePickNumber: pick.rookiePickNumber,
            pickValue: rookie.pickValue,
            expectedValue: rookie.expectedValue,
            score: rookie.score,
            letter: scoreToLetter(rookie.score),
            source: 'value-curve'
          })
          continue
        }
        grades.set(pick.pickNo, { pickNo: pick.pickNo, graded: false, reason: 'no-pick-value' })
        continue
      }

      grades.set(pick.pickNo, {
        pickNo: pick.pickNo,
        graded: false,
        reason: 'position-not-graded'
      })
      continue
    }

    // A player counts against the positional run whether or not he is on the
    // sheet — he came off the board either way.
    const posPick = (takenAtPosition.get(position) ?? 0) + 1
    takenAtPosition.set(position, posPick)

    // Must match the exact pipeline the sheet was normalized with.
    const lookupName = applyAlias(normalizeName(pick.playerName))
    const userRank = index.get(position)?.get(lookupName)

    if (userRank === undefined) {
      grades.set(pick.pickNo, {
        pickNo: pick.pickNo,
        graded: false,
        reason: 'not-on-sheet'
      })
      continue
    }

    const gradedPosition = position as GradedPosition
    const fromCurve = curves ? curveScore(curves, pool, gradedPosition, posPick, userRank) : null
    // How many players the sheet actually offers at this position in this pool.
    const poolDepth = index.get(position)?.size ?? 0
    const score = fromCurve ?? ordinalScore(posPick, userRank, poolDepth)

    grades.set(pick.pickNo, {
      pickNo: pick.pickNo,
      graded: true,
      kind: 'player',
      position: gradedPosition,
      posPick,
      userRank,
      score,
      letter: scoreToLetter(score),
      source: fromCurve === null ? 'sheet-order' : 'value-curve'
    })
  }

  return grades
}

/**
 * Aggregate a set of picks into one team grade.
 *
 * Averages the raw scores and maps to a letter once. Grading each pick to a
 * letter first and averaging those would round twice through a step function
 * and lose the within-band spread.
 */
export function gradeTeam(
  pickNos: Iterable<number>,
  grades: Map<number, PickGrade>
): TeamGrade {
  let totalCount = 0
  let gradedCount = 0
  let sum = 0

  for (const pickNo of pickNos) {
    totalCount++
    const grade = grades.get(pickNo)
    if (grade?.graded) {
      sum += grade.score
      gradedCount++
    }
  }

  if (gradedCount === 0) {
    return { letter: null, averageScore: null, gradedCount: 0, totalCount }
  }

  const averageScore = sum / gradedCount
  return { letter: scoreToLetter(averageScore), averageScore, gradedCount, totalCount }
}

/**
 * Whether a pool's curves are deep enough to price picks. The UI uses this to
 * explain why value-curve grading is inactive rather than silently ignoring it.
 */
export function curvesUsableForPool(curves: ValueCurves | null, pool: DraftPool): boolean {
  if (!curves) return false
  const byPosition = (pool === 'rookies' ? curves.rookies : curves.all).byPosition
  return Object.values(byPosition).some(curve => curve.length >= MIN_CURVE_DEPTH)
}

/** Compact inputs behind a grade, e.g. "RB8 · sheet RB3". */
export function formatGradeDetail(grade: GradedPick): string {
  if (grade.kind === 'rookie-pick') {
    return `pick value ${grade.pickValue} · slot ${grade.expectedValue}`
  }
  return `${grade.position}${grade.posPick} · sheet ${grade.position}${grade.userRank}`
}

/** Long-form explanation for tooltips. */
export function formatGradeExplanation(grade: GradedPick): string {
  if (grade.kind === 'rookie-pick') {
    const delta = grade.pickValue - grade.expectedValue
    const verdict = delta >= 0 ? 'above' : 'below'
    return (
      `${grade.letter} — rookie pick ${grade.rookiePickNumber} is worth ${grade.pickValue}, ` +
      `${Math.abs(delta)} ${verdict} the ${grade.expectedValue} typically available at this ` +
      `draft slot (RosterAudit value curve)`
    )
  }

  const { position, posPick, userRank, letter, source } = grade
  const diff = posPick - userRank

  const movement =
    diff > 0
      ? `fell ${diff} spot${diff === 1 ? '' : 's'} past your rank`
      : diff < 0
        ? `taken ${-diff} spot${diff === -1 ? '' : 's'} ahead of your rank`
        : 'taken exactly at your rank'

  const basis =
    source === 'value-curve'
      ? 'priced on the RosterAudit value curve'
      : 'scored on sheet order'

  return (
    `${letter} — ${position}${posPick} off the board, your sheet has him ` +
    `${position}${userRank} (${movement}; ${basis})`
  )
}

export function describeUngraded(reason: UngradedReason): string {
  switch (reason) {
    case 'not-on-sheet':
      return 'Not on your ranking sheet'
    case 'no-pick-value':
      return 'No curve value for this rookie pick'
    default:
      return 'Position is not graded'
  }
}

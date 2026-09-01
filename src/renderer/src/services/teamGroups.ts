import { DraftPick } from '../types'
import { DraftTeams } from './sleeperApi'
import { PickGrade, TeamGrade, gradeTeam } from './draftGrade'

/**
 * Groups a draft's picks into teams for the Teams board.
 *
 * Kept out of the component so the grouping, fallback and ordering rules can be
 * tested directly rather than through a render.
 */

const COUNT_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'PICK']

export interface TeamGroup {
  key: string
  /** Null when Sleeper gave no owner for these picks (autodraft, mock drafts). */
  userId: string | null
  label: string
  /**
   * Identity-free label for screenshots. Draft slot is already visible in every
   * pick number (1.03), so naming by slot reveals nothing the board does not.
   */
  anonymousLabel: string
  slot: number | null
  picks: DraftPick[]
  grade: TeamGrade
  counts: Array<[string, number]>
  isMine: boolean
}

function positionCounts(picks: DraftPick[]): Array<[string, number]> {
  const counts: Record<string, number> = {}
  for (const pick of picks) {
    const position = (pick.position || 'OTHER').toUpperCase()
    counts[position] = (counts[position] ?? 0) + 1
  }

  return Object.entries(counts).sort((a, b) => {
    const ai = COUNT_ORDER.indexOf(a[0])
    const bi = COUNT_ORDER.indexOf(b[0])
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

export function groupPicksByTeam(
  picks: DraftPick[],
  myUserIds: Set<string>,
  grades: Map<number, PickGrade>,
  draftTeams: DraftTeams | null
): TeamGroup[] {
  // Sleeper leaves picked_by empty on autodrafted picks, so one manager's picks
  // can arrive partly owned and partly anonymous. Learn slot -> owner from the
  // picks that do carry an id (and from draft_order) so the ownerless ones
  // rejoin their team instead of splitting off into a duplicate card.
  const slotToUser = new Map<number, string>()
  for (const [userId, slot] of Object.entries(draftTeams?.draftOrder ?? {})) {
    if (Number.isFinite(slot)) slotToUser.set(Number(slot), userId)
  }
  for (const pick of picks) {
    if (pick.pickedBy && pick.draftSlot) slotToUser.set(pick.draftSlot, pick.pickedBy)
  }

  const byTeam = new Map<string, DraftPick[]>()

  for (const pick of picks) {
    const owner =
      pick.pickedBy || (pick.draftSlot ? slotToUser.get(pick.draftSlot) : undefined) || ''
    const key = owner ? `user:${owner}` : pick.draftSlot ? `slot:${pick.draftSlot}` : 'unassigned'
    const existing = byTeam.get(key)
    if (existing) existing.push(pick)
    else byTeam.set(key, [pick])
  }

  const built: TeamGroup[] = []
  for (const [key, teamPicks] of byTeam) {
    teamPicks.sort((a, b) => a.pickNo - b.pickNo)

    const userId = key.startsWith('user:') ? key.slice('user:'.length) : null
    // The pick's own draft_slot is ground truth. draft_order is only a
    // fallback: it can be stale, or predate a traded draft slot.
    const slot =
      teamPicks.find(p => p.draftSlot)?.draftSlot ||
      (userId ? draftTeams?.draftOrder?.[userId] : undefined) ||
      null

    const named = userId ? draftTeams?.ownerNames?.[userId] : undefined

    built.push({
      key,
      userId,
      label: named || (slot ? `Slot ${slot}` : 'Unassigned'),
      // Filled in below, once every group is known, so labels are unique.
      anonymousLabel: '',
      slot: slot ?? null,
      picks: teamPicks,
      grade: gradeTeam(
        teamPicks.map(p => p.pickNo),
        grades
      ),
      counts: positionCounts(teamPicks),
      isMine: !!userId && myUserIds.has(userId)
    })
  }

  // Number the anonymous labels in draft-slot order so they are stable and,
  // above all, unique — two cards reading "Team 1" is worse than a label that
  // does not match the slot exactly.
  const bySlot = [...built].sort((a, b) => {
    if (a.slot !== null && b.slot !== null && a.slot !== b.slot) return a.slot - b.slot
    if (a.slot === null) return 1
    if (b.slot === null) return -1
    return a.label.localeCompare(b.label)
  })
  bySlot.forEach((group, i) => {
    group.anonymousLabel = `Team ${i + 1}`
  })

  // Your team first, then natural draft order.
  return built.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1
    if (a.slot !== null && b.slot !== null && a.slot !== b.slot) return a.slot - b.slot
    return a.label.localeCompare(b.label)
  })
}

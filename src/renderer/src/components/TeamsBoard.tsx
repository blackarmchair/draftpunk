import React, { useMemo } from 'react'
import { DraftPick } from '../types'
import { DraftTeams } from '../services/sleeperApi'
import {
  PickGrade,
  describeUngraded,
  formatGradeDetail,
  formatGradeExplanation,
  gradeTone
} from '../services/draftGrade'
import { groupPicksByTeam } from '../services/teamGroups'

interface TeamsBoardProps {
  picks: DraftPick[]
  myUserIds: Set<string>
  grades: Map<number, PickGrade>
  draftTeams: DraftTeams | null
  /** Replaces manager names with neutral labels for public screenshots. */
  anonymize: boolean
  onToggleTeam: (userId: string) => void
  onToggleAnonymize: () => void
}

export function TeamsBoard({
  picks,
  myUserIds,
  grades,
  draftTeams,
  anonymize,
  onToggleTeam,
  onToggleAnonymize
}: TeamsBoardProps) {
  const groups = useMemo(
    () => groupPicksByTeam(picks, myUserIds, grades, draftTeams),
    [picks, myUserIds, grades, draftTeams]
  )

  if (!groups.length) {
    return (
      <div className="my-team empty">
        <div className="empty-state">
          <h2>No Picks Yet</h2>
          <p>Team boards appear here once the draft starts.</p>
          <p>Mark your own team to pin it to the top.</p>
        </div>
      </div>
    )
  }

  const mineMarked = groups.some(g => g.isMine)

  return (
    <div className="my-team">
      <div className="my-team-header">
        <h2>All Teams</h2>
        <div className="my-team-header-meta">
          {!mineMarked && !anonymize && (
            <span className="teams-hint">Click “This is me” to pin your team</span>
          )}
          <button
            className={`anon-toggle ${anonymize ? 'active' : ''}`}
            onClick={onToggleAnonymize}
            title={
              anonymize
                ? 'Manager names are hidden — safe to screenshot'
                : 'Replace manager names with neutral labels for sharing'
            }
          >
            {anonymize ? 'Show names' : 'Hide names'}
          </button>
          <span className="roster-count">{groups.length} teams</span>
        </div>
      </div>

      <div className="teams-grid">
        {groups.map(group => (
          <div key={group.key} className={`team-card ${group.isMine ? 'mine' : ''}`}>
            <div className="team-card-head">
              <div className="team-card-title">
                <h3>{anonymize ? group.anonymousLabel : group.label}</h3>
                {group.isMine && <span className="team-mine-badge">YOUR TEAM</span>}
              </div>
              {group.grade.letter ? (
                <span
                  className={`team-grade tone-${gradeTone(group.grade.letter)}`}
                  title={`Average of ${group.grade.gradedCount} graded pick${
                    group.grade.gradedCount === 1 ? '' : 's'
                  } (score ${group.grade.averageScore?.toFixed(2)})`}
                >
                  {group.grade.letter}
                  <span className="team-grade-denominator">
                    {group.grade.gradedCount}/{group.grade.totalCount}
                  </span>
                </span>
              ) : (
                <span className="team-grade ungraded" title="No picks matched your sheet">
                  —
                </span>
              )}
            </div>

            <div className="team-card-sub">
              <span className="team-counts">
                {group.counts.map(([position, count]) => (
                  <span key={position} className={`count-chip pos-${position.toLowerCase()}`}>
                    {position} {count}
                  </span>
                ))}
              </span>
              {group.userId && !anonymize && (
                <button
                  className="team-mine-toggle"
                  onClick={() => onToggleTeam(group.userId as string)}
                >
                  {group.isMine ? 'Not me' : 'This is me'}
                </button>
              )}
            </div>

            <div className="team-picks">
              {group.picks.map(pick => {
                const grade = grades.get(pick.pickNo)
                return (
                  <div key={pick.pickNo} className="team-pick">
                    <span className="team-pick-no">{pick.pickDisplay}</span>
                    <span className="team-pick-body">
                      <span className="team-pick-name">{pick.playerName}</span>
                      {grade?.graded && (
                        <span className="team-pick-detail">{formatGradeDetail(grade)}</span>
                      )}
                    </span>
                    <span className={`team-pick-pos pos-${(pick.position || '').toLowerCase()}`}>
                      {pick.position}
                    </span>
                    {grade?.graded ? (
                      <span
                        className={`roster-grade tone-${gradeTone(grade.letter)}`}
                        title={formatGradeExplanation(grade)}
                      >
                        {grade.letter}
                      </span>
                    ) : (
                      <span
                        className="roster-grade ungraded"
                        title={grade ? describeUngraded(grade.reason) : 'Not graded'}
                      >
                        —
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

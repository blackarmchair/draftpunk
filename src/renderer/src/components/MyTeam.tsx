import React from 'react'
import { DraftPick } from '../types'

interface MyTeamProps {
  picks: DraftPick[]
  myPickIds: Set<number>
}

export function MyTeam({ picks, myPickIds }: MyTeamProps) {
  const myPicks = picks.filter(pick => myPickIds.has(pick.pickNo))

  // Group by position
  const byPosition: Record<string, DraftPick[]> = {}
  for (const pick of myPicks) {
    const pos = pick.position || 'OTHER'
    if (!byPosition[pos]) {
      byPosition[pos] = []
    }
    byPosition[pos].push(pick)
  }

  // Define position order
  const positionOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'PICK', 'OTHER']
  const sortedPositions = Object.keys(byPosition).sort((a, b) => {
    const aIndex = positionOrder.indexOf(a)
    const bIndex = positionOrder.indexOf(b)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })

  if (myPicks.length === 0) {
    return (
      <div className="my-team empty">
        <div className="empty-state">
          <h2>No Players Yet</h2>
          <p>Click on picks in the timeline above to mark them as yours.</p>
          <p>Your drafted players will appear here organized by position.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="my-team">
      <div className="my-team-header">
        <h2>My Team</h2>
        <span className="roster-count">{myPicks.length} players</span>
      </div>

      <div className="roster-grid">
        {sortedPositions.map(position => (
          <div key={position} className={`position-group pos-${position.toLowerCase()}`}>
            <h3 className="position-header">{position}</h3>
            <div className="position-players">
              {byPosition[position].map(pick => (
                <div key={pick.pickNo} className="roster-player">
                  <span className="roster-pick">{pick.pickDisplay}</span>
                  <span className="roster-name">{pick.playerName}</span>
                  {pick.team && <span className="roster-team">{pick.team}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

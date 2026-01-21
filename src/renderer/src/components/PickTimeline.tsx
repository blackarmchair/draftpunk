import React, { useRef, useEffect } from 'react'
import { DraftPick } from '../types'

interface PickTimelineProps {
  picks: DraftPick[]
  myPickIds: Set<number>
  onToggleMyPick: (pickNo: number) => void
}

export function PickTimeline({ picks, myPickIds, onToggleMyPick }: PickTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the latest pick when new picks come in
  useEffect(() => {
    if (scrollRef.current && picks.length > 0) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [picks.length])

  if (picks.length === 0) {
    return (
      <div className="pick-timeline empty">
        <p>No picks yet. Waiting for draft to begin...</p>
      </div>
    )
  }

  return (
    <div className="pick-timeline">
      <div className="timeline-header">
        <h3>Draft Picks</h3>
        <span className="pick-count">{picks.length} picks</span>
      </div>
      <div className="timeline-scroll" ref={scrollRef}>
        {picks.map((pick) => {
          const isMyPick = myPickIds.has(pick.pickNo)
          return (
            <button
              key={pick.pickNo}
              className={`pick-card ${isMyPick ? 'my-pick' : ''} pos-${pick.position.toLowerCase()}`}
              onClick={() => onToggleMyPick(pick.pickNo)}
              title={isMyPick ? 'Click to unmark as your pick' : 'Click to mark as your pick'}
            >
              <div className="pick-number">{pick.pickDisplay}</div>
              <div className="pick-player">{pick.playerName}</div>
              <div className="pick-details">
                <span className="pick-position">{pick.position}</span>
                {pick.team && <span className="pick-team">{pick.team}</span>}
              </div>
              {isMyPick && <div className="my-pick-badge">MY PICK</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

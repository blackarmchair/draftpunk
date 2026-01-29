import React from 'react'
import type { BestBallProjection } from '../types'

interface BestBallTableProps {
  projections: BestBallProjection[]
  isLoading: boolean
}

export function BestBallTable({ projections, isLoading }: BestBallTableProps) {
  if (isLoading) {
    return (
      <div className="standings-loading">
        <div className="loading-spinner" />
        <p>Calculating Best Ball projections...</p>
      </div>
    )
  }

  if (projections.length === 0) {
    return (
      <div className="standings-empty">
        <p>No projections available. Load a league to see Best Ball standings.</p>
      </div>
    )
  }

  return (
    <div className="standings-table-container">
      <table className="standings-table bestball-table">
        <thead>
          <tr>
            <th className="col-rank">Draft Order</th>
            <th className="col-team">Team</th>
            <th className="col-ytd">YTD Points</th>
            <th className="col-projected">Projected</th>
            <th className="col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {projections.map((proj) => (
            <tr key={proj.rosterId} className={proj.draftOrder && proj.draftOrder <= 4 ? 'top-pick' : ''}>
              <td className="col-rank">
                <span className="draft-order">{proj.draftOrder ?? proj.rank}</span>
              </td>
              <td className="col-team">{proj.ownerName}</td>
              <td className="col-ytd">{proj.ytdPoints.toFixed(2)}</td>
              <td className="col-projected">{proj.projectedPoints.toFixed(2)}</td>
              <td className="col-total">{proj.totalPoints.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bestball-legend">
        <span className="legend-item">
          <span className="legend-color top-pick-color" /> Top 4 Draft Picks (Non-Playoff)
        </span>
      </div>
    </div>
  )
}

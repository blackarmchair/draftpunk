import React, { useState } from 'react'
import type { PowerRankingTeam } from '../types'

interface PowerRankingsTableProps {
  rankings: PowerRankingTeam[]
  isLoading: boolean
}

type SortField = 'total' | 'qb' | 'rb' | 'wr' | 'te'

export function PowerRankingsTable({ rankings, isLoading }: PowerRankingsTableProps) {
  const [sortBy, setSortBy] = useState<SortField>('total')

  if (isLoading) {
    return (
      <div className="standings-loading">
        <div className="loading-spinner" />
        <p>Calculating Power Rankings...</p>
        <p className="loading-note">Fetching KTC values may take a moment...</p>
      </div>
    )
  }

  if (rankings.length === 0) {
    return (
      <div className="standings-empty">
        <p>No rankings available. Load a league to see Power Rankings.</p>
      </div>
    )
  }

  // Sort rankings based on selected field
  const sortedRankings = [...rankings].sort((a, b) => {
    switch (sortBy) {
      case 'qb':
        return b.qbValue - a.qbValue
      case 'rb':
        return b.rbValue - a.rbValue
      case 'wr':
        return b.wrValue - a.wrValue
      case 'te':
        return b.teValue - a.teValue
      default:
        return b.totalValue - a.totalValue
    }
  })

  const maxTotal = Math.max(...rankings.map((r) => r.totalValue))

  return (
    <div className="standings-table-container">
      <div className="standings-filters">
        <div className="filter-group">
          <label>Sort By:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortField)}>
            <option value="total">Total Value</option>
            <option value="qb">QB Value</option>
            <option value="rb">RB Value</option>
            <option value="wr">WR Value</option>
            <option value="te">TE Value</option>
          </select>
        </div>
      </div>

      <table className="standings-table power-rankings-table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-team">Team</th>
            <th
              className={`col-total ${sortBy === 'total' ? 'sorted' : ''}`}
              onClick={() => setSortBy('total')}
            >
              Total
            </th>
            <th
              className={`col-qb ${sortBy === 'qb' ? 'sorted' : ''}`}
              onClick={() => setSortBy('qb')}
            >
              QB
            </th>
            <th
              className={`col-rb ${sortBy === 'rb' ? 'sorted' : ''}`}
              onClick={() => setSortBy('rb')}
            >
              RB
            </th>
            <th
              className={`col-wr ${sortBy === 'wr' ? 'sorted' : ''}`}
              onClick={() => setSortBy('wr')}
            >
              WR
            </th>
            <th
              className={`col-te ${sortBy === 'te' ? 'sorted' : ''}`}
              onClick={() => setSortBy('te')}
            >
              TE
            </th>
            <th className="col-bar">Value Distribution</th>
          </tr>
        </thead>
        <tbody>
          {sortedRankings.map((team, index) => (
            <tr key={team.rosterId}>
              <td className="col-rank">{index + 1}</td>
              <td className="col-team">
                <div className="team-info">
                  <span className="team-name">{team.ownerName}</span>
                  {team.teamName && <span className="team-nickname">{team.teamName}</span>}
                </div>
              </td>
              <td className="col-total">
                <span className="value-total">{team.totalValue.toLocaleString()}</span>
              </td>
              <td className="col-qb">{team.qbValue.toLocaleString()}</td>
              <td className="col-rb">{team.rbValue.toLocaleString()}</td>
              <td className="col-wr">{team.wrValue.toLocaleString()}</td>
              <td className="col-te">{team.teValue.toLocaleString()}</td>
              <td className="col-bar">
                <div className="value-bar-container">
                  <div
                    className="value-bar"
                    style={{ width: `${(team.totalValue / maxTotal) * 100}%` }}
                  >
                    <div
                      className="value-segment qb-segment"
                      style={{ width: `${(team.qbValue / team.totalValue) * 100}%` }}
                    />
                    <div
                      className="value-segment rb-segment"
                      style={{ width: `${(team.rbValue / team.totalValue) * 100}%` }}
                    />
                    <div
                      className="value-segment wr-segment"
                      style={{ width: `${(team.wrValue / team.totalValue) * 100}%` }}
                    />
                    <div
                      className="value-segment te-segment"
                      style={{ width: `${(team.teValue / team.totalValue) * 100}%` }}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="power-rankings-legend">
        <span className="legend-item">
          <span className="legend-color qb-color" /> QB
        </span>
        <span className="legend-item">
          <span className="legend-color rb-color" /> RB
        </span>
        <span className="legend-item">
          <span className="legend-color wr-color" /> WR
        </span>
        <span className="legend-item">
          <span className="legend-color te-color" /> TE
        </span>
      </div>
    </div>
  )
}

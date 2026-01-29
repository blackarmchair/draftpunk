import React, { useState } from 'react'
import type { PWOPRDisplayRow } from '../types'
import { getInjuryStatusClass } from '../utils/injuryHelpers'

interface PWOPRTableProps {
  projections: PWOPRDisplayRow[]
  isLoading: boolean
}

const TIER_ORDER = ['Elite', 'WR1', 'WR2/TE1', 'WR3/Flex', 'Deep Flex', 'Bench']

export function PWOPRTable({ projections, isLoading }: PWOPRTableProps) {
  const [positionFilter, setPositionFilter] = useState<'all' | 'WR' | 'TE'>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')

  if (isLoading) {
    return (
      <div className="standings-loading">
        <div className="loading-spinner" />
        <p>Calculating PWOPR projections...</p>
      </div>
    )
  }

  if (projections.length === 0) {
    return (
      <div className="standings-empty">
        <p>No projections available. Load a league to see PWOPR rankings.</p>
      </div>
    )
  }

  const filteredProjections = projections.filter((p) => {
    if (positionFilter !== 'all' && p.pos !== positionFilter) return false
    if (tierFilter !== 'all' && p.tier !== tierFilter) return false
    return true
  })

  // Group by tier
  const groupedByTier = TIER_ORDER.map((tier) => ({
    tier,
    players: filteredProjections.filter((p) => p.tier === tier),
  })).filter((g) => g.players.length > 0)

  return (
    <div className="standings-table-container">
      <div className="standings-filters">
        <div className="filter-group">
          <label>Position:</label>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value as 'all' | 'WR' | 'TE')}
          >
            <option value="all">All</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Tier:</label>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
            <option value="all">All Tiers</option>
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {groupedByTier.map(({ tier, players }) => (
        <div key={tier} className="tier-section">
          <h3 className="tier-header">
            <span className={`tier-badge tier-${tier.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
              {tier}
            </span>
          </h3>
          <table className="standings-table pwopr-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-name">Name</th>
                <th className="col-team">Team</th>
                <th className="col-pos">Pos</th>
                <th className="col-pwopr">PWOPR</th>
                <th className="col-floor">Floor</th>
                <th className="col-ceiling">Ceil</th>
                <th className="col-sleeper">Sleeper</th>
                <th className="col-injury">Injury</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={`${player.name}-${player.team}`}>
                  <td className="col-rank">{player.rank}</td>
                  <td className="col-name">{player.name}</td>
                  <td className="col-team">{player.team}</td>
                  <td className={`col-pos pos-${player.pos.toLowerCase()}`}>{player.pos}</td>
                  <td className="col-pwopr">
                    <span className={`pwopr-value ${getPWOPRClass(player.pwopr)}`}>
                      {player.pwopr.toFixed(2)}
                    </span>
                  </td>
                  <td className="col-floor">{player.floor.toFixed(2)}</td>
                  <td className="col-ceiling">{player.ceiling.toFixed(2)}</td>
                  <td className="col-sleeper">
                    {player.sleeperProj ? player.sleeperProj.toFixed(1) : '-'}
                  </td>
                  <td className={`col-injury ${getInjuryStatusClass(player.injuryStatus)}`}>
                    {player.injuryStatus || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function getPWOPRClass(pwopr: number): string {
  if (pwopr >= 20) return 'pwopr-elite'
  if (pwopr >= 15) return 'pwopr-wr1'
  if (pwopr >= 12) return 'pwopr-wr2'
  if (pwopr >= 9) return 'pwopr-wr3'
  return 'pwopr-low'
}

import React, { useState } from 'react'
import type { PWRBDisplayRow } from '../types'

interface PWRBTableProps {
  projections: PWRBDisplayRow[]
  isLoading: boolean
}

const TIER_ORDER = ['Elite', 'RB1', 'RB2', 'RB3/Flex', 'Deep Flex', 'Bench']

export function PWRBTable({ projections, isLoading }: PWRBTableProps) {
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  if (isLoading) {
    return (
      <div className="standings-loading">
        <div className="loading-spinner" />
        <p>Calculating PWRB projections...</p>
      </div>
    )
  }

  if (projections.length === 0) {
    return (
      <div className="standings-empty">
        <p>No projections available. Load a league to see PWRB rankings.</p>
      </div>
    )
  }

  const filteredProjections = projections.filter((p) => {
    if (tierFilter !== 'all' && p.tier !== tierFilter) return false
    if (roleFilter !== 'all' && p.role !== roleFilter) return false
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
        <div className="filter-group">
          <label>Role:</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="lead">Lead Back</option>
            <option value="committee">Committee</option>
            <option value="backup">Backup</option>
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
          <table className="standings-table pwrb-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-name">Name</th>
                <th className="col-team">Team</th>
                <th className="col-pwrb">PWRB</th>
                <th className="col-wor">WOR</th>
                <th className="col-cei">CEI</th>
                <th className="col-rwo">RWO</th>
                <th className="col-floor">Floor</th>
                <th className="col-ceiling">Ceil</th>
                <th className="col-role">Role</th>
                <th className="col-age">Age</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={`${player.name}-${player.team}`}>
                  <td className="col-rank">{player.rank}</td>
                  <td className="col-name">{player.name}</td>
                  <td className="col-team">{player.team}</td>
                  <td className="col-pwrb">
                    <span className={`pwrb-value ${getPWRBClass(player.pwrb)}`}>
                      {player.pwrb.toFixed(3)}
                    </span>
                  </td>
                  <td className="col-wor">{player.wor.toFixed(3)}</td>
                  <td className="col-cei">{player.cei.toFixed(3)}</td>
                  <td className="col-rwo">{player.rwo.toFixed(3)}</td>
                  <td className="col-floor">{player.floor.toFixed(3)}</td>
                  <td className="col-ceiling">{player.ceiling.toFixed(3)}</td>
                  <td className={`col-role role-${player.role}`}>
                    {formatRole(player.role)}
                  </td>
                  <td className="col-age">{player.age ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function getPWRBClass(pwrb: number): string {
  if (pwrb >= 1.5) return 'pwrb-elite'
  if (pwrb >= 0.8) return 'pwrb-rb1'
  if (pwrb >= 0.5) return 'pwrb-rb2'
  if (pwrb >= 0.35) return 'pwrb-rb3'
  return 'pwrb-low'
}

function formatRole(role?: string): string {
  if (!role) return '-'
  switch (role) {
    case 'lead':
      return 'Lead'
    case 'committee':
      return 'CMTE'
    case 'backup':
      return 'BU'
    default:
      return role
  }
}

import React, { useState, useMemo } from 'react'
import { RankingRow } from '../types'

interface BoardTableProps {
  rankings: RankingRow[]
  onToggleTaken: (index: number) => void
}

export function BoardTable({ rankings, onToggleTaken }: BoardTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [positionFilter, setPositionFilter] = useState('All')
  const [hideTaken, setHideTaken] = useState(true)
  const [groupByTier, setGroupByTier] = useState(true)

  // Get unique positions
  const positions = useMemo(() => {
    const posSet = new Set<string>()
    rankings.forEach(r => {
      if (r.position) posSet.add(r.position.toUpperCase())
    })
    return ['All', ...Array.from(posSet).sort()]
  }, [rankings])

  // Filter rankings
  const filteredRankings = useMemo(() => {
    return rankings.filter(ranking => {
      // Search filter
      if (searchQuery && !ranking.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Position filter
      if (positionFilter !== 'All' && ranking.position.toUpperCase() !== positionFilter) {
        return false
      }

      // Hide taken filter
      if (hideTaken && ranking.taken) {
        return false
      }

      return true
    })
  }, [rankings, searchQuery, positionFilter, hideTaken])

  // Group by tier if enabled
  const groupedData = useMemo(() => {
    if (!groupByTier) {
      return [{ tier: null, items: filteredRankings }]
    }

    const groups = new Map<string, RankingRow[]>()

    filteredRankings.forEach(ranking => {
      const tier = String(ranking.tier)
      if (!groups.has(tier)) {
        groups.set(tier, [])
      }
      groups.get(tier)!.push(ranking)
    })

    // Convert to array and sort by tier
    return Array.from(groups.entries())
      .map(([tier, items]) => ({ tier, items }))
      .sort((a, b) => {
        const tierA = parseFloat(a.tier) || 0
        const tierB = parseFloat(b.tier) || 0
        return tierA - tierB
      })
  }, [filteredRankings, groupByTier])

  // Calculate tier pressure (remaining count per tier)
  const tierPressure = useMemo(() => {
    const pressure = new Map<string, number>()

    rankings.forEach(ranking => {
      const tier = String(ranking.tier)
      if (!ranking.taken) {
        pressure.set(tier, (pressure.get(tier) || 0) + 1)
      }
    })

    return pressure
  }, [rankings])

  return (
    <div className="board-table">
      <div className="controls">
        <div className="control-row">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />

          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="position-filter"
          >
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </div>

        <div className="control-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hideTaken}
              onChange={(e) => setHideTaken(e.target.checked)}
            />
            Hide Taken
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={groupByTier}
              onChange={(e) => setGroupByTier(e.target.checked)}
            />
            Group by Tier
          </label>
        </div>
      </div>

      <div className="table-container">
        {groupedData.map((group, groupIndex) => (
          <div key={groupIndex} className="tier-group">
            {group.tier !== null && (
              <div className="tier-header">
                <span className="tier-name">Tier {group.tier}</span>
                {tierPressure.has(group.tier) && (
                  <span
                    className={`tier-remaining ${
                      (tierPressure.get(group.tier) || 0) <= 2 ? 'pressure' : ''
                    }`}
                  >
                    {tierPressure.get(group.tier)} remaining
                  </span>
                )}
              </div>
            )}

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tier</th>
                  <th>Position</th>
                  {group.items.some(item => item.assetType) && <th>Asset Type</th>}
                  <th>Taken</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((ranking) => {
                  const originalIndex = rankings.indexOf(ranking)
                  return (
                    <tr key={originalIndex} className={ranking.taken ? 'taken' : ''}>
                      <td className="name-cell">{ranking.name}</td>
                      <td>{ranking.tier}</td>
                      <td>{ranking.position}</td>
                      {group.items.some(item => item.assetType) && (
                        <td>{ranking.assetType || ''}</td>
                      )}
                      <td>
                        <input
                          type="checkbox"
                          checked={ranking.taken}
                          onChange={() => onToggleTaken(originalIndex)}
                          title={ranking.manualOverride ? 'Manual override' : 'Auto-detected'}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {filteredRankings.length === 0 && (
          <div className="empty-state">
            No players match the current filters
          </div>
        )}
      </div>
    </div>
  )
}

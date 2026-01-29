import React, { useState, useEffect } from 'react'

const LEAGUE_HISTORY_KEY = 'draft-punk-league-history'
const MAX_HISTORY = 5

interface LeagueSelectorProps {
  leagueId: string
  onLeagueIdChange: (id: string) => void
  onLoadLeague: () => void
  isLoading: boolean
  leagueName?: string | null
  error?: string | null
}

export function LeagueSelector({
  leagueId,
  onLeagueIdChange,
  onLoadLeague,
  isLoading,
  leagueName,
  error,
}: LeagueSelectorProps) {
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(LEAGUE_HISTORY_KEY)
    if (stored) {
      try {
        setHistory(JSON.parse(stored))
      } catch {
        setHistory([])
      }
    }
  }, [])

  const saveToHistory = (id: string) => {
    if (!id) return
    const newHistory = [id, ...history.filter((h) => h !== id)].slice(0, MAX_HISTORY)
    setHistory(newHistory)
    localStorage.setItem(LEAGUE_HISTORY_KEY, JSON.stringify(newHistory))
  }

  const handleLoad = () => {
    if (leagueId) {
      saveToHistory(leagueId)
      onLoadLeague()
    }
  }

  const handleHistorySelect = (id: string) => {
    onLeagueIdChange(id)
    setShowHistory(false)
  }

  return (
    <div className="league-selector">
      <div className="league-input-group">
        <label>League ID</label>
        <div className="input-with-history">
          <input
            type="text"
            value={leagueId}
            onChange={(e) => onLeagueIdChange(e.target.value)}
            placeholder="Enter Sleeper League ID"
            disabled={isLoading}
            onFocus={() => history.length > 0 && setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          />
          {showHistory && history.length > 0 && (
            <div className="history-dropdown">
              {history.map((id) => (
                <button key={id} className="history-item" onClick={() => handleHistorySelect(id)}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="load-league-btn" onClick={handleLoad} disabled={isLoading || !leagueId}>
          {isLoading ? 'Loading...' : 'Load League'}
        </button>
      </div>

      {leagueName && <div className="league-name">League: {leagueName}</div>}

      {error && <div className="league-error">{error}</div>}
    </div>
  )
}

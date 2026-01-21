import React, { useState, useEffect } from 'react'
import { DraftSettings } from '../types'

interface SettingsProps {
  onSettingsChange: (settings: DraftSettings) => void
  isPolling: boolean
}

const STORAGE_KEY = 'draft-punk-settings'

export function Settings({ onSettingsChange, isPolling }: SettingsProps) {
  const [draftId, setDraftId] = useState('')
  const [pollIntervalMs, setPollIntervalMs] = useState(5000)
  const [rookiePickMode, setRookiePickMode] = useState(false)
  const [leagueSize, setLeagueSize] = useState(12)
  const [showHelp, setShowHelp] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const settings: DraftSettings = JSON.parse(stored)
        setDraftId(settings.draftId || '')
        setPollIntervalMs(settings.pollIntervalMs || 5000)
        setRookiePickMode(settings.rookiePickMode || false)
        setLeagueSize(settings.leagueSize || 12)
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
  }, [])

  const handleApply = () => {
    const settings: DraftSettings = {
      draftId: draftId.trim(),
      pollIntervalMs,
      rookiePickMode,
      leagueSize
    }

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))

    // Notify parent
    onSettingsChange(settings)
  }

  const handlePollIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value > 0) {
      setPollIntervalMs(value)
    }
  }

  return (
    <div className="settings-panel">
      <h2>Draft Settings</h2>

      <div className="form-group">
        <label htmlFor="draftId">
          Draft ID
          <button
            type="button"
            className="help-button"
            onClick={() => setShowHelp(!showHelp)}
            title="How to find Draft ID"
          >
            ?
          </button>
        </label>
        <input
          id="draftId"
          type="text"
          value={draftId}
          onChange={(e) => setDraftId(e.target.value)}
          placeholder="e.g., 987654321098765432"
          disabled={isPolling}
        />
        {showHelp && (
          <div className="help-text">
            <strong>How to find your Draft ID:</strong>
            <ol>
              <li>Go to your Sleeper draft room</li>
              <li>Look at the URL in your browser</li>
              <li>The Draft ID is the long number after "/draft/"</li>
              <li>Example: sleeper.com/draft/nfl/<strong>987654321098765432</strong></li>
            </ol>
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="pollInterval">Poll Interval (ms)</label>
        <input
          id="pollInterval"
          type="number"
          value={pollIntervalMs}
          onChange={handlePollIntervalChange}
          min="1000"
          step="1000"
          disabled={isPolling}
        />
        <small>How often to check for new picks (default: 5000ms = 5 seconds)</small>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={rookiePickMode}
            onChange={(e) => setRookiePickMode(e.target.checked)}
            disabled={isPolling}
          />
          Rookie Pick Mode
        </label>
        <small>When enabled, kickers drafted represent rookie picks (1.01, 1.02, etc.)</small>
      </div>

      {rookiePickMode && (
        <div className="form-group">
          <label htmlFor="leagueSize">League Size</label>
          <select
            id="leagueSize"
            value={leagueSize}
            onChange={(e) => setLeagueSize(parseInt(e.target.value, 10))}
            disabled={isPolling}
          >
            <option value="8">8 Teams</option>
            <option value="10">10 Teams</option>
            <option value="12">12 Teams</option>
            <option value="14">14 Teams</option>
          </select>
          <small>Used to calculate round numbers (1.01-1.{leagueSize}, 2.01-2.{leagueSize}, etc.)</small>
        </div>
      )}

      <button
        onClick={handleApply}
        disabled={!draftId.trim() || isPolling}
        className="apply-button"
      >
        {isPolling ? 'Polling Active' : 'Start Polling'}
      </button>
    </div>
  )
}

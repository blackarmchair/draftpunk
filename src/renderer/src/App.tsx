import React, { useState, useEffect, useRef } from 'react'
import { Settings } from './components/Settings'
import { BoardTable } from './components/BoardTable'
import { LogPanel } from './components/LogPanel'
import { PickTimeline } from './components/PickTimeline'
import { MyTeam } from './components/MyTeam'
import { StandingsPage } from './components/StandingsPage'
import { SleeperService } from './services/sleeper'
import { parseCSV } from './utils/csvParser'
import { RankingRow, DraftSettings, SyncStatus, LogEntry, DraftPick, ActiveTab } from './types'
import './App.css'

const MAX_LOGS = 10
const STORED_CSVS_KEY = 'draft-punk-stored-csvs'
const MY_USER_IDS_KEY = 'draft-punk-my-user-ids'

interface StoredCSV {
  id: string
  name: string
  content: string
  loadedAt: string
}

export function App() {
  const [rankings, setRankings] = useState<RankingRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSync: null,
    picksCount: 0,
    error: null,
    isPolling: false
  })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [storedCSVs, setStoredCSVs] = useState<StoredCSV[]>([])
  const [selectedCSVId, setSelectedCSVId] = useState<string | null>(null)
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([])
  const [myUserIds, setMyUserIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<ActiveTab>('board')
  const [standingsLeagueId, setStandingsLeagueId] = useState<string>('')

  const sleeperService = useRef<SleeperService>(new SleeperService())

  // Load stored CSVs and my picks from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORED_CSVS_KEY)
    if (stored) {
      try {
        const csvs: StoredCSV[] = JSON.parse(stored)
        setStoredCSVs(csvs)
      } catch (error) {
        console.error('Failed to load stored CSVs:', error)
      }
    }

    const storedUserIds = localStorage.getItem(MY_USER_IDS_KEY)
    if (storedUserIds) {
      try {
        const userIds: string[] = JSON.parse(storedUserIds)
        setMyUserIds(new Set(userIds))
      } catch (error) {
        console.error('Failed to load my user IDs:', error)
      }
    }
  }, [])

  const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs(prev => {
      const newLog: LogEntry = {
        timestamp: new Date(),
        message,
        type
      }
      return [newLog, ...prev].slice(0, MAX_LOGS)
    })
  }

  const handleFileSelect = async () => {
    try {
      const result = await window.electron.openFile()

      if (result) {
        const parsed = parseCSV(result.content)
        const name = result.filePath.split(/[/\\]/).pop() || result.filePath

        setRankings(parsed)
        setFileName(name)

        // Save to stored CSVs
        const newCSV: StoredCSV = {
          id: Date.now().toString(),
          name,
          content: result.content,
          loadedAt: new Date().toISOString()
        }

        const updatedCSVs = [...storedCSVs.filter(csv => csv.name !== name), newCSV]
        setStoredCSVs(updatedCSVs)
        setSelectedCSVId(newCSV.id)
        localStorage.setItem(STORED_CSVS_KEY, JSON.stringify(updatedCSVs))

        addLog(`Loaded ${parsed.length} players from CSV`, 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load CSV'
      addLog(message, 'error')
      alert(`Error loading CSV: ${message}`)
    }
  }

  const handleSelectCSV = (csvId: string) => {
    const csv = storedCSVs.find(c => c.id === csvId)
    if (csv) {
      const parsed = parseCSV(csv.content)
      setRankings(parsed)
      setFileName(csv.name)
      setSelectedCSVId(csvId)
      addLog(`Switched to ${csv.name}`, 'info')
    }
  }

  const handleDeleteCSV = (csvId: string) => {
    const updatedCSVs = storedCSVs.filter(c => c.id !== csvId)
    setStoredCSVs(updatedCSVs)
    localStorage.setItem(STORED_CSVS_KEY, JSON.stringify(updatedCSVs))

    if (selectedCSVId === csvId) {
      setRankings([])
      setFileName(null)
      setSelectedCSVId(null)
    }

    addLog('CSV removed from saved list', 'info')
  }

  const handleSettingsChange = (settings: DraftSettings) => {
    if (!settings.draftId) {
      addLog('Draft ID is required', 'error')
      return
    }

    // Stop any existing polling
    sleeperService.current.stopPolling()

    // Start new polling
    sleeperService.current.startPolling(
      settings.draftId,
      settings.pollIntervalMs,
      settings.rookiePickMode,
      settings.leagueSize,
      {
        onPicksUpdate: (pickedNames) => {
          setRankings(prev => {
            return prev.map(ranking => {
              const shouldBeTaken = pickedNames.has(ranking.normalizedName)

              // Only update if not manually overridden
              if (ranking.manualOverride) {
                return ranking
              }

              return {
                ...ranking,
                taken: shouldBeTaken
              }
            })
          })
        },
        onDraftPicksUpdate: (picks) => {
          setDraftPicks(picks)
        },
        onError: (error) => {
          setSyncStatus(prev => ({ ...prev, error }))
          addLog(`Sync error: ${error}`, 'error')
        },
        onSync: (picksCount) => {
          setSyncStatus({
            lastSync: new Date(),
            picksCount,
            error: null,
            isPolling: true
          })
          addLog(`Synced ${picksCount} picks`, 'success')
        }
      }
    )

    setSyncStatus(prev => ({ ...prev, isPolling: true, error: null }))
    const modeMsg = settings.rookiePickMode ? ` (Rookie Pick Mode: ${settings.leagueSize} teams)` : ''
    addLog(`Started polling draft ${settings.draftId}${modeMsg}`, 'info')
  }

  const handleToggleTaken = (index: number) => {
    setRankings(prev => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        taken: !updated[index].taken,
        manualOverride: true
      }
      return updated
    })

    addLog(`Manually toggled: ${rankings[index].name}`, 'info')
  }

  const handleToggleMyPick = (pickNo: number) => {
    const pick = draftPicks.find(p => p.pickNo === pickNo)
    if (!pick || !pick.pickedBy) return

    const userId = pick.pickedBy
    const wasMyPick = myUserIds.has(userId)

    setMyUserIds(prev => {
      const updated = new Set(prev)
      if (updated.has(userId)) {
        updated.delete(userId)
      } else {
        updated.add(userId)
      }
      // Persist to localStorage
      localStorage.setItem(MY_USER_IDS_KEY, JSON.stringify([...updated]))
      return updated
    })

    const userPicks = draftPicks.filter(p => p.pickedBy === userId)
    const action = wasMyPick ? 'Unmarked' : 'Marked'
    addLog(`${action} ${userPicks.length} picks as mine (user: ${userId})`, 'info')
  }

  const handleStopPolling = () => {
    sleeperService.current.stopPolling()
    setSyncStatus(prev => ({ ...prev, isPolling: false }))
    addLog('Stopped polling', 'info')
  }

  const handleReset = () => {
    // Stop polling if active
    sleeperService.current.stopPolling()

    // Clear all state
    setRankings([])
    setFileName(null)
    setSyncStatus({
      lastSync: null,
      picksCount: 0,
      error: null,
      isPolling: false
    })
    setLogs([])
    setDraftPicks([])
    setMyUserIds(new Set())
    setActiveTab('board')
    localStorage.removeItem(MY_USER_IDS_KEY)

    addLog('Reset complete - ready for new draft', 'success')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sleeperService.current.stopPolling()
    }
  }, [])

  const takenCount = rankings.filter(r => r.taken).length

  // Derive myPickIds from myUserIds for the components
  const myPickIds = new Set(
    draftPicks.filter(p => myUserIds.has(p.pickedBy)).map(p => p.pickNo)
  )

  return (
    <div className="app">
      <header className="app-header">
        <h1>Draft Punk</h1>
        <p className="subtitle">Sleeper Dynasty Draft Board</p>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <div className="file-section">
            <h2>Rankings CSV</h2>
            <button onClick={handleFileSelect} className="load-button">
              Load CSV File
            </button>

            {storedCSVs.length > 0 && (
              <div className="stored-csvs">
                <label htmlFor="csv-select">Saved CSVs:</label>
                <div className="csv-selector-wrapper">
                  <select
                    id="csv-select"
                    value={selectedCSVId || ''}
                    onChange={(e) => handleSelectCSV(e.target.value)}
                    className="csv-select"
                  >
                    <option value="">Select a CSV...</option>
                    {storedCSVs.map(csv => (
                      <option key={csv.id} value={csv.id}>
                        {csv.name}
                      </option>
                    ))}
                  </select>
                  {selectedCSVId && (
                    <button
                      onClick={() => handleDeleteCSV(selectedCSVId)}
                      className="delete-csv-button"
                      title="Remove this CSV from saved list"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {fileName && (
              <div className="file-info">
                <small>File: {fileName}</small>
                <div className="stats">
                  <span>{rankings.length} total</span>
                  <span>{takenCount} taken</span>
                  <span>{rankings.length - takenCount} available</span>
                </div>
              </div>
            )}
            {(rankings.length > 0 || syncStatus.isPolling) && (
              <button onClick={handleReset} className="reset-button">
                New Draft
              </button>
            )}
          </div>

          <Settings
            onSettingsChange={handleSettingsChange}
            isPolling={syncStatus.isPolling}
          />

          {syncStatus.isPolling && (
            <div className="sync-status">
              <div className="status-item">
                <strong>Status:</strong> Polling
              </div>
              {syncStatus.lastSync && (
                <div className="status-item">
                  <strong>Last sync:</strong>{' '}
                  {syncStatus.lastSync.toLocaleTimeString()}
                </div>
              )}
              <div className="status-item">
                <strong>Picks:</strong> {syncStatus.picksCount}
              </div>
              {syncStatus.error && (
                <div className="status-item error">
                  <strong>Error:</strong> {syncStatus.error}
                </div>
              )}
              <button onClick={handleStopPolling} className="stop-button">
                Stop Polling
              </button>
            </div>
          )}

          <LogPanel logs={logs} />
        </aside>

        <main className="main-content">
          {rankings.length === 0 ? (
            <div className="no-rankings-view">
              <div className="tab-navigation">
                <button
                  className={`tab-button ${activeTab !== 'standings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('board')}
                >
                  Draft Board
                </button>
                <button
                  className={`tab-button ${activeTab === 'standings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('standings')}
                >
                  Standings
                </button>
              </div>

              {activeTab === 'standings' ? (
                <StandingsPage initialLeagueId={standingsLeagueId} />
              ) : (
                <div className="welcome">
                  <h2>Welcome to Draft Punk!</h2>
                  <p>Get started by loading your rankings CSV file.</p>
                  <ol>
                    <li>Click "Load CSV File" to select your rankings</li>
                    <li>Enter your Sleeper Draft ID in the settings</li>
                    <li>Click "Start Polling" to begin tracking picks</li>
                  </ol>
                  <p className="standings-hint">
                    Or check out the <button className="link-button" onClick={() => setActiveTab('standings')}>Standings</button> tab to view league projections and power rankings.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {syncStatus.isPolling && (
                <PickTimeline
                  picks={draftPicks}
                  myPickIds={myPickIds}
                  onToggleMyPick={handleToggleMyPick}
                />
              )}

              <div className="tab-navigation">
                <button
                  className={`tab-button ${activeTab === 'board' ? 'active' : ''}`}
                  onClick={() => setActiveTab('board')}
                >
                  Draft Board
                </button>
                <button
                  className={`tab-button ${activeTab === 'myteam' ? 'active' : ''}`}
                  onClick={() => setActiveTab('myteam')}
                >
                  My Team ({myPickIds.size})
                </button>
                <button
                  className={`tab-button ${activeTab === 'standings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('standings')}
                >
                  Standings
                </button>
              </div>

              {activeTab === 'board' && (
                <BoardTable rankings={rankings} onToggleTaken={handleToggleTaken} />
              )}
              {activeTab === 'myteam' && (
                <MyTeam picks={draftPicks} myPickIds={myPickIds} />
              )}
              {activeTab === 'standings' && (
                <StandingsPage initialLeagueId={standingsLeagueId} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Settings } from './components/Settings'
import { BoardTable } from './components/BoardTable'
import { LogPanel } from './components/LogPanel'
import { PickTimeline } from './components/PickTimeline'
import { TeamsBoard } from './components/TeamsBoard'
import { SleeperService } from './services/sleeper'
import { getRosteredPlayerNames, getLeague, getDraftTeams, DraftTeams } from './services/sleeperApi'
import {
  buildPositionalRankIndex,
  curvesUsableForPool,
  gradePicks
} from './services/draftGrade'
import {
  ROSTER_AUDIT_FORMATS,
  RosterAuditFormat,
  ValueCurves,
  getValueCurves,
  inferFormat
} from './services/rosterAudit'
import { DRAFT_POOLS, DraftPool, getRookieNames, rookieShare } from './services/draftPool'
import { parseCSV } from './utils/csvParser'
import { RankingRow, DraftSettings, SyncStatus, LogEntry, DraftPick } from './types'
import './App.css'

const MAX_LOGS = 10
const STORED_CSVS_KEY = 'draft-punk-stored-csvs'
const MY_USER_IDS_KEY = 'draft-punk-my-user-ids'
const CURVE_ENABLED_KEY = 'draft-punk-curve-enabled'
const CURVE_FORMAT_KEY = 'draft-punk-curve-format'
const DRAFT_POOL_KEY = 'draft-punk-draft-pool'
const ANONYMIZE_KEY = 'draft-punk-anonymize-teams'
/** Rookie share above which we prompt to switch pools. */
const ROOKIE_POOL_HINT_THRESHOLD = 0.7

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
  const [activeTab, setActiveTab] = useState<'board' | 'teams'>('board')
  const [rosterLeagueId, setRosterLeagueId] = useState<string>('')
  const [rosteredNames, setRosteredNames] = useState<Set<string>>(new Set())
  const [rosterLoading, setRosterLoading] = useState(false)
  const [curveEnabled, setCurveEnabled] = useState(false)
  const [curveFormat, setCurveFormat] = useState<RosterAuditFormat>('sf_ppr')
  const [curves, setCurves] = useState<ValueCurves | null>(null)
  const [curvesLoading, setCurvesLoading] = useState(false)
  const [curvesError, setCurvesError] = useState<string | null>(null)
  const [draftPool, setDraftPool] = useState<DraftPool>('all')
  const [rookieNames, setRookieNames] = useState<Set<string> | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolError, setPoolError] = useState<string | null>(null)
  const [poolReloadToken, setPoolReloadToken] = useState(0)
  const [draftTeams, setDraftTeams] = useState<DraftTeams | null>(null)
  const [anonymizeTeams, setAnonymizeTeams] = useState(false)

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

    const storedPool = localStorage.getItem(DRAFT_POOL_KEY)
    if (storedPool === 'all' || storedPool === 'rookies') setDraftPool(storedPool)

    setAnonymizeTeams(localStorage.getItem(ANONYMIZE_KEY) === 'true')
    setCurveEnabled(localStorage.getItem(CURVE_ENABLED_KEY) === 'true')
    const storedFormat = localStorage.getItem(CURVE_FORMAT_KEY)
    if (storedFormat && ROSTER_AUDIT_FORMATS.some(f => f.key === storedFormat)) {
      setCurveFormat(storedFormat as RosterAuditFormat)
    }
  }, [])

  // The rookie name list is needed both to restrict the pool and to notice a
  // rookie draft being graded against the full sheet, so it loads either way.
  // Sleeper's players payload is ~15MB, so only the derived set is cached.
  useEffect(() => {
    if (rookieNames) return

    const controller = new AbortController()
    let cancelled = false

    setPoolLoading(true)
    setPoolError(null)
    getRookieNames({ signal: controller.signal })
      .then(names => {
        if (cancelled) return
        setRookieNames(names)
        addLog(`Loaded ${names.size} rookies for pool filtering`, 'success')
      })
      .catch(error => {
        if (cancelled || error?.name === 'AbortError') return
        const message = error instanceof Error ? error.message : 'Failed to load rookie list'
        setPoolError(message)
        addLog(`Could not load rookie list: ${message}`, 'error')
      })
      .finally(() => {
        if (!cancelled) setPoolLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // poolReloadToken lets a failed load be retried; without it a single
    // failure would leave the pool permanently unavailable.
  }, [rookieNames, poolReloadToken])

  // Load the RosterAudit value curve when enabled. Cache-first, so a mid-draft
  // toggle is instant on a warm cache and a feed outage never blocks grading —
  // the grader falls back to sheet-order scoring on its own.
  useEffect(() => {
    if (!curveEnabled) {
      setCurves(null)
      setCurvesError(null)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    setCurvesLoading(true)
    getValueCurves(curveFormat, { signal: controller.signal })
      .then(loaded => {
        if (cancelled) return
        setCurves(loaded)
        setCurvesError(null)
        const depths = Object.entries(loaded.all.byPosition)
          .map(([pos, values]) => `${pos} ${values.length}`)
          .join(', ')
        addLog(`Loaded RosterAudit ${curveFormat} curve (${depths})`, 'success')
      })
      .catch(error => {
        if (cancelled || error?.name === 'AbortError') return
        const message = error instanceof Error ? error.message : 'Failed to load value curve'
        setCurves(null)
        setCurvesError(message)
        addLog(`Value curve unavailable, using sheet order: ${message}`, 'error')
      })
      .finally(() => {
        if (!cancelled) setCurvesLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [curveEnabled, curveFormat])

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

    // Manager names are static for a draft, so this runs once per start rather
    // than on every poll. Failure is non-fatal — teams fall back to slots.
    setDraftTeams(null)
    getDraftTeams(settings.draftId)
      .then(teams => {
        setDraftTeams(teams)
        const named = Object.keys(teams.ownerNames).length
        addLog(named ? `Resolved ${named} manager names` : 'Draft has no league; using slots', 'info')
      })
      .catch(() => {
        addLog('Could not resolve manager names; using draft slots', 'info')
      })
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
    addLog(`${action} ${userPicks.length} picks as mine`, 'info')
  }

  const handleToggleAnonymize = () => {
    setAnonymizeTeams(prev => {
      const next = !prev
      localStorage.setItem(ANONYMIZE_KEY, String(next))
      return next
    })
  }

  const handleToggleMyTeam = (userId: string) => {
    if (!userId) return

    setMyUserIds(prev => {
      const updated = new Set(prev)
      if (updated.has(userId)) updated.delete(userId)
      else updated.add(userId)
      localStorage.setItem(MY_USER_IDS_KEY, JSON.stringify([...updated]))
      return updated
    })
  }

  const handleStopPolling = () => {
    sleeperService.current.stopPolling()
    setSyncStatus(prev => ({ ...prev, isPolling: false }))
    addLog('Stopped polling', 'info')
  }

  const handleLoadRosters = async () => {
    if (!rosterLeagueId.trim()) {
      addLog('League ID is required', 'error')
      return
    }
    setRosterLoading(true)
    try {
      const names = await getRosteredPlayerNames(rosterLeagueId.trim())
      setRosteredNames(names)
      addLog(`Loaded ${names.size} rostered players from league`, 'success')

      // Superflex vs 1QB changes QB values enormously, so take the league's
      // own roster settings over the default when we can see them.
      try {
        const league = await getLeague(rosterLeagueId.trim())
        const detected = inferFormat(league?.roster_positions)
        if (detected && detected !== curveFormat) {
          handleCurveFormatChange(detected)
          const label = ROSTER_AUDIT_FORMATS.find(f => f.key === detected)?.label ?? detected
          addLog(`Detected ${label} from league settings`, 'info')
        }
      } catch {
        // Format detection is a convenience; keep whatever is already selected.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load league rosters'
      addLog(message, 'error')
    } finally {
      setRosterLoading(false)
    }
  }

  const handleToggleCurve = () => {
    setCurveEnabled(prev => {
      const next = !prev
      localStorage.setItem(CURVE_ENABLED_KEY, String(next))
      addLog(
        next
          ? 'Value curve grading ON — spacing from RosterAudit, order still yours'
          : 'Value curve grading OFF — grading on sheet order only',
        'info'
      )
      return next
    })
  }

  const handleDraftPoolChange = (pool: DraftPool) => {
    setDraftPool(pool)
    localStorage.setItem(DRAFT_POOL_KEY, pool)
    addLog(
      pool === 'rookies'
        ? 'Grading against rookies on your sheet'
        : 'Grading against your full sheet',
      'info'
    )
  }

  const handleCurveFormatChange = (format: RosterAuditFormat) => {
    setCurveFormat(format)
    localStorage.setItem(CURVE_FORMAT_KEY, format)
  }

  const handleClearRosters = () => {
    setRosteredNames(new Set())
    setRosterLeagueId('')
    addLog('Cleared rostered player filter', 'info')
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
    setDraftTeams(null)
    setRosteredNames(new Set())
    setRosterLeagueId('')
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
  const myPickIds = useMemo(
    () => new Set(draftPicks.filter(p => myUserIds.has(p.pickedBy)).map(p => p.pickNo)),
    [draftPicks, myUserIds]
  )

  // Grades are derived state only — the ranking sheet is never written back to.
  const activePool = draftPool === 'rookies' ? rookieNames : null
  const rankIndex = useMemo(
    () => buildPositionalRankIndex(rankings, activePool),
    [rankings, activePool]
  )
  const pickGrades = useMemo(
    () => gradePicks(draftPicks, rankIndex, curveEnabled ? curves : null, draftPool),
    [draftPicks, rankIndex, curveEnabled, curves, draftPool]
  )

  // Notice when a rookie draft is being graded against the full sheet, which
  // makes every correct pick look like a reach. Surfaced as a prompt rather
  // than switched automatically — the pool changes what the grades mean.
  const suggestRookiePool = useMemo(() => {
    if (draftPool !== 'all' || !rookieNames || draftPicks.length < 4) return false
    const share = rookieShare(
      draftPicks.map(p => ({ name: p.playerName, position: p.position })),
      rookieNames
    )
    return share >= ROOKIE_POOL_HINT_THRESHOLD
  }, [draftPool, rookieNames, draftPicks])

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

          <div className="file-section">
            <h2>League Rosters</h2>
            <div className="roster-league-input">
              <input
                type="text"
                placeholder="Sleeper League ID"
                value={rosterLeagueId}
                onChange={(e) => setRosterLeagueId(e.target.value)}
                className="search-input"
                disabled={rosterLoading}
              />
              <div className="roster-buttons">
                <button
                  onClick={handleLoadRosters}
                  className="load-button"
                  disabled={rosterLoading || !rosterLeagueId.trim()}
                >
                  {rosterLoading ? 'Loading...' : 'Load'}
                </button>
                {rosteredNames.size > 0 && (
                  <button onClick={handleClearRosters} className="reset-button">
                    Clear
                  </button>
                )}
              </div>
            </div>
            {rosteredNames.size > 0 && (
              <div className="file-info">
                <small>{rosteredNames.size} rostered players loaded</small>
              </div>
            )}
          </div>

          <div className="file-section">
            <h2>Pick Grading</h2>

            <label className="pool-label" htmlFor="draft-pool">
              Draft pool
            </label>
            <select
              id="draft-pool"
              value={draftPool}
              onChange={e => handleDraftPoolChange(e.target.value as DraftPool)}
              className="csv-select"
            >
              {DRAFT_POOLS.map(pool => (
                <option key={pool.key} value={pool.key}>
                  {pool.label}
                </option>
              ))}
            </select>
            <p className="curve-help">
              {poolLoading
                ? 'Loading rookie list…'
                : DRAFT_POOLS.find(p => p.key === draftPool)?.hint}
            </p>

            {draftPool === 'rookies' && !rookieNames && !poolLoading && (
              <div className="pool-warning">
                <strong>Rookie list unavailable — grades are NOT pool-adjusted.</strong>
                <span>
                  {poolError ?? 'The rookie list has not loaded yet.'} Until it loads, picks are
                  still ranked against your full sheet, which reads correct rookie picks as
                  reaches.
                </span>
                <button
                  className="load-button"
                  onClick={() => setPoolReloadToken(t => t + 1)}
                  disabled={poolLoading}
                >
                  Retry
                </button>
              </div>
            )}

            {suggestRookiePool && (
              <div className="pool-suggestion">
                <strong>This looks like a rookie draft.</strong>
                <span>
                  Grading against your full sheet makes correct rookie picks read as reaches,
                  because rookies rank below veterans on it.
                </span>
                <button
                  className="load-button"
                  onClick={() => handleDraftPoolChange('rookies')}
                >
                  Grade against rookies
                </button>
              </div>
            )}

            <label className="curve-toggle">
              <input type="checkbox" checked={curveEnabled} onChange={handleToggleCurve} />
              <span>Use RosterAudit value curve</span>
            </label>
            <p className="curve-help">
              {curveEnabled
                ? 'Spacing between rank slots comes from market values. Your sheet still decides the order.'
                : 'Grading on your sheet order alone. No network needed.'}
            </p>

            {curveEnabled && curves && !curvesUsableForPool(curves, draftPool) && (
              <div className="pool-warning">
                <strong>Value curve inactive for this pool.</strong>
                <span>
                  The rookie value curve is only 10–18 deep per position and flat past the top
                  few, so it cannot tell picks apart. Grading on sheet order instead, which
                  discriminates at any depth.
                </span>
              </div>
            )}

            {curveEnabled && (
              <>
                <select
                  value={curveFormat}
                  onChange={e => handleCurveFormatChange(e.target.value as RosterAuditFormat)}
                  className="csv-select"
                  disabled={curvesLoading}
                >
                  {ROSTER_AUDIT_FORMATS.map(format => (
                    <option key={format.key} value={format.key}>
                      {format.label}
                    </option>
                  ))}
                </select>

                <div className="file-info">
                  {curvesLoading && <small>Loading value curve…</small>}
                  {!curvesLoading && curves && (
                    <small>
                      Curve depth:{' '}
                      {Object.entries(
                        (draftPool === 'rookies' ? curves.rookies : curves.all).byPosition
                      )
                        .map(([pos, values]) => `${pos} ${values.length}`)
                        .join(' · ')}
                    </small>
                  )}
                  {!curvesLoading && curvesError && (
                    <small className="curve-error">
                      Feed unavailable — grading on sheet order
                    </small>
                  )}
                </div>

                {curves && (
                  <a
                    className="curve-attribution"
                    href={curves.attributionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {curves.attribution}
                  </a>
                )}
              </>
            )}
          </div>

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
            <div className="welcome">
              <h2>Welcome to Draft Punk!</h2>
              <p>Get started by loading your rankings CSV file.</p>
              <ol>
                <li>Click "Load CSV File" to select your rankings</li>
                <li>Enter your Sleeper Draft ID in the settings</li>
                <li>Click "Start Polling" to begin tracking picks</li>
              </ol>
            </div>
          ) : (
            <>
              {syncStatus.isPolling && (
                <PickTimeline
                  picks={draftPicks}
                  myPickIds={myPickIds}
                  grades={pickGrades}
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
                  className={`tab-button ${activeTab === 'teams' ? 'active' : ''}`}
                  onClick={() => setActiveTab('teams')}
                >
                  Teams
                </button>
              </div>

              {activeTab === 'board' && (
                <BoardTable rankings={rankings} onToggleTaken={handleToggleTaken} rosteredNames={rosteredNames} />
              )}
              {activeTab === 'teams' && (
                <TeamsBoard
                  picks={draftPicks}
                  myUserIds={myUserIds}
                  grades={pickGrades}
                  draftTeams={draftTeams}
                  anonymize={anonymizeTeams}
                  onToggleTeam={handleToggleMyTeam}
                  onToggleAnonymize={handleToggleAnonymize}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

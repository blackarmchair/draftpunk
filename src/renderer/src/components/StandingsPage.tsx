import React, { useState, useEffect, useCallback } from 'react'
import type {
  StandingsSubTab,
  PWOPRDataStrategy,
  LeagueData,
  NFLState,
  BestBallProjection,
  PWOPRDisplayRow,
  PWRBDisplayRow,
  PowerRankingTeam,
} from '../types'
import { LeagueSelector } from './LeagueSelector'
import { DataStrategySelector } from './DataStrategySelector'
import { BestBallTable } from './BestBallTable'
import { PWOPRTable } from './PWOPRTable'
import { PWRBTable } from './PWRBTable'
import { PowerRankingsTable } from './PowerRankingsTable'
import { loadLeagueData, getNFLState, getLeagueName } from '../services/sleeperApi'
import {
  getBestBallProjections,
  getPWOPRProjections,
  getPWRBProjections,
  getPowerRankings,
} from '../services/projectionEngine'

interface StandingsPageProps {
  initialLeagueId?: string
}

export function StandingsPage({ initialLeagueId }: StandingsPageProps) {
  // League state
  const [leagueId, setLeagueId] = useState(initialLeagueId || '')
  const [leagueName, setLeagueName] = useState<string | null>(null)
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null)
  const [nflState, setNflState] = useState<NFLState | null>(null)
  const [leagueError, setLeagueError] = useState<string | null>(null)
  const [isLoadingLeague, setIsLoadingLeague] = useState(false)

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<StandingsSubTab>('bestball')
  const [dataStrategy, setDataStrategy] = useState<PWOPRDataStrategy>('current-week')

  // Projection data states
  const [bestBallProjections, setBestBallProjections] = useState<BestBallProjection[]>([])
  const [pwoprProjections, setPwoprProjections] = useState<PWOPRDisplayRow[]>([])
  const [pwrbProjections, setPwrbProjections] = useState<PWRBDisplayRow[]>([])
  const [powerRankings, setPowerRankings] = useState<PowerRankingTeam[]>([])

  // Loading states for each tab
  const [isLoadingBestBall, setIsLoadingBestBall] = useState(false)
  const [isLoadingPWOPR, setIsLoadingPWOPR] = useState(false)
  const [isLoadingPWRB, setIsLoadingPWRB] = useState(false)
  const [isLoadingPower, setIsLoadingPower] = useState(false)

  // Load league data
  const handleLoadLeague = useCallback(async () => {
    if (!leagueId) return

    setIsLoadingLeague(true)
    setLeagueError(null)
    setBestBallProjections([])
    setPwoprProjections([])
    setPwrbProjections([])
    setPowerRankings([])

    try {
      const [data, state, name] = await Promise.all([
        loadLeagueData(leagueId),
        getNFLState(),
        getLeagueName(leagueId),
      ])

      setLeagueData(data)
      setNflState(state)
      setLeagueName(name)
    } catch (error) {
      setLeagueError(error instanceof Error ? error.message : 'Failed to load league')
      setLeagueData(null)
      setNflState(null)
      setLeagueName(null)
    } finally {
      setIsLoadingLeague(false)
    }
  }, [leagueId])

  // Load projections when league data changes or tab changes
  useEffect(() => {
    if (!leagueData || !nflState) return

    const loadProjections = async () => {
      switch (activeSubTab) {
        case 'bestball':
          if (bestBallProjections.length === 0) {
            setIsLoadingBestBall(true)
            try {
              const projections = await getBestBallProjections(
                leagueData.league,
                leagueData.rosters,
                leagueData.users,
                leagueData.playersMeta,
                leagueId,
                nflState
              )
              setBestBallProjections(projections)
            } catch (error) {
              console.error('Failed to load Best Ball projections:', error)
            } finally {
              setIsLoadingBestBall(false)
            }
          }
          break

        case 'pwopr':
          if (pwoprProjections.length === 0) {
            setIsLoadingPWOPR(true)
            try {
              const projections = await getPWOPRProjections(leagueId, dataStrategy, nflState)
              setPwoprProjections(projections)
            } catch (error) {
              console.error('Failed to load PWOPR projections:', error)
            } finally {
              setIsLoadingPWOPR(false)
            }
          }
          break

        case 'pwrb':
          if (pwrbProjections.length === 0) {
            setIsLoadingPWRB(true)
            try {
              const projections = await getPWRBProjections(leagueId, dataStrategy, nflState)
              setPwrbProjections(projections)
            } catch (error) {
              console.error('Failed to load PWRB projections:', error)
            } finally {
              setIsLoadingPWRB(false)
            }
          }
          break

        case 'power':
          if (powerRankings.length === 0) {
            setIsLoadingPower(true)
            try {
              const rankings = await getPowerRankings(leagueData.league, leagueId)
              setPowerRankings(rankings)
            } catch (error) {
              console.error('Failed to load Power Rankings:', error)
            } finally {
              setIsLoadingPower(false)
            }
          }
          break
      }
    }

    loadProjections()
  }, [leagueData, nflState, activeSubTab, leagueId, dataStrategy])

  // Refresh data when strategy changes
  const handleStrategyChange = (strategy: PWOPRDataStrategy) => {
    setDataStrategy(strategy)
    // Clear cached projections to force refresh
    setPwoprProjections([])
    setPwrbProjections([])
  }

  const subTabs: { key: StandingsSubTab; label: string }[] = [
    { key: 'bestball', label: 'Best Ball' },
    { key: 'pwopr', label: 'PWOPR' },
    { key: 'pwrb', label: 'PWRB' },
    { key: 'power', label: 'Power Rankings' },
  ]

  return (
    <div className="standings-page">
      <div className="standings-header">
        <LeagueSelector
          leagueId={leagueId}
          onLeagueIdChange={setLeagueId}
          onLoadLeague={handleLoadLeague}
          isLoading={isLoadingLeague}
          leagueName={leagueName}
          error={leagueError}
        />

        {leagueData && nflState && (
          <div className="standings-info">
            <span className="week-info">Week {nflState.week}</span>
            <span className="season-info">{nflState.season} Season</span>
          </div>
        )}
      </div>

      <div className="standings-sub-nav">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            className={`sub-tab-button ${activeSubTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveSubTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(activeSubTab === 'pwopr' || activeSubTab === 'pwrb') && leagueData && (
        <div className="standings-controls">
          <DataStrategySelector
            value={dataStrategy}
            onChange={handleStrategyChange}
            disabled={isLoadingPWOPR || isLoadingPWRB}
          />
        </div>
      )}

      <div className="standings-content">
        {activeSubTab === 'bestball' && (
          <BestBallTable projections={bestBallProjections} isLoading={isLoadingBestBall} />
        )}

        {activeSubTab === 'pwopr' && (
          <PWOPRTable projections={pwoprProjections} isLoading={isLoadingPWOPR} />
        )}

        {activeSubTab === 'pwrb' && (
          <PWRBTable projections={pwrbProjections} isLoading={isLoadingPWRB} />
        )}

        {activeSubTab === 'power' && (
          <PowerRankingsTable rankings={powerRankings} isLoading={isLoadingPower} />
        )}
      </div>
    </div>
  )
}

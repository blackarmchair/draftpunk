import { DraftPick } from '../types'
import { normalizeName } from '../utils/normalizeName'
import { applyAlias } from '../data/aliases'

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'

export interface SleeperDraftPicksResponse {
  pick_no: number
  player_id: string
  picked_by: string
  metadata?: {
    first_name?: string
    last_name?: string
    player_name?: string
    position?: string
    team?: string
  }
}

export class SleeperService {
  private intervalId: number | null = null
  private draftId: string | null = null
  private pollIntervalMs: number = 5000
  private rookiePickMode: boolean = false
  private leagueSize: number = 12
  private onPicksUpdate: ((pickedNames: Set<string>) => void) | null = null
  private onDraftPicksUpdate: ((picks: DraftPick[]) => void) | null = null
  private onError: ((error: string) => void) | null = null
  private onSync: ((picksCount: number) => void) | null = null

  /**
   * Start polling the Sleeper API for draft picks
   */
  startPolling(
    draftId: string,
    pollIntervalMs: number,
    rookiePickMode: boolean,
    leagueSize: number,
    callbacks: {
      onPicksUpdate: (pickedNames: Set<string>) => void
      onDraftPicksUpdate: (picks: DraftPick[]) => void
      onError: (error: string) => void
      onSync: (picksCount: number) => void
    }
  ): void {
    this.stopPolling()

    this.draftId = draftId
    this.pollIntervalMs = pollIntervalMs
    this.rookiePickMode = rookiePickMode
    this.leagueSize = leagueSize
    this.onPicksUpdate = callbacks.onPicksUpdate
    this.onDraftPicksUpdate = callbacks.onDraftPicksUpdate
    this.onError = callbacks.onError
    this.onSync = callbacks.onSync

    // Initial fetch
    this.fetchPicks()

    // Set up interval
    this.intervalId = window.setInterval(() => {
      this.fetchPicks()
    }, this.pollIntervalMs)
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Fetch draft picks from Sleeper API
   */
  private async fetchPicks(): Promise<void> {
    if (!this.draftId) return

    try {
      const url = `${SLEEPER_API_BASE}/draft/${this.draftId}/picks`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const picks: SleeperDraftPicksResponse[] = await response.json()

      // Sort by pick number
      picks.sort((a, b) => (a.pick_no || 0) - (b.pick_no || 0))

      // Extract and normalize player names
      const pickedNames = new Set<string>()
      const draftPicks: DraftPick[] = []
      let kickerCount = 0

      for (const pick of picks) {
        const position = pick.metadata?.position?.toUpperCase() || ''

        // Handle rookie pick mode: kickers represent rookie picks
        if (this.rookiePickMode && position === 'K') {
          kickerCount++
          const round = Math.ceil(kickerCount / this.leagueSize)
          const pickInRound = ((kickerCount - 1) % this.leagueSize) + 1
          const pickNumber = `${pickInRound}`.padStart(2, '0')
          const rookiePickName = `2026 ${round}.${pickNumber}`

          const normalized = normalizeName(rookiePickName)
          pickedNames.add(normalized)

          // Add to draft picks array
          draftPicks.push({
            pickNo: pick.pick_no,
            pickDisplay: this.formatPickDisplay(pick.pick_no),
            playerName: rookiePickName,
            position: 'PICK',
            team: '',
            pickedBy: pick.picked_by || '',
            isMyPick: false
          })
          continue
        }

        const playerName = this.extractPlayerName(pick)
        if (playerName) {
          const normalized = normalizeName(playerName)
          const withAlias = applyAlias(normalized)
          pickedNames.add(withAlias)

          // Add to draft picks array
          draftPicks.push({
            pickNo: pick.pick_no,
            pickDisplay: this.formatPickDisplay(pick.pick_no),
            playerName,
            position: position || '',
            team: pick.metadata?.team || '',
            pickedBy: pick.picked_by || '',
            isMyPick: false
          })
        }
      }

      // Notify callbacks
      if (this.onPicksUpdate) {
        this.onPicksUpdate(pickedNames)
      }
      if (this.onDraftPicksUpdate) {
        this.onDraftPicksUpdate(draftPicks)
      }
      if (this.onSync) {
        this.onSync(picks.length)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (this.onError) {
        this.onError(errorMessage)
      }
    }
  }

  /**
   * Extract player name from a pick
   * Prefer metadata.first_name + metadata.last_name
   * Fallback to metadata.player_name
   */
  private extractPlayerName(pick: SleeperDraftPicksResponse): string | null {
    if (!pick.metadata) return null

    const { first_name, last_name, player_name } = pick.metadata

    if (first_name && last_name) {
      return `${first_name} ${last_name}`
    }

    if (player_name) {
      return player_name
    }

    return null
  }

  /**
   * Format pick number as round.pick (e.g., 2.09)
   */
  private formatPickDisplay(pickNo: number): string {
    const round = Math.ceil(pickNo / this.leagueSize)
    const pickInRound = ((pickNo - 1) % this.leagueSize) + 1
    return `${round}.${pickInRound.toString().padStart(2, '0')}`
  }

  /**
   * Check if currently polling
   */
  isPolling(): boolean {
    return this.intervalId !== null
  }
}

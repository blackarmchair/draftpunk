export interface RankingRow {
  name: string
  tier: string | number
  position: string
  assetType?: string
  taken: boolean
  manualOverride?: boolean
  normalizedName: string
}

export interface DraftSettings {
  draftId: string
  pollIntervalMs: number
  rookiePickMode: boolean
  leagueSize: number
}

export interface SleeperPick {
  pick_no: number
  player_id: string
  picked_by: string
  metadata: {
    first_name?: string
    last_name?: string
    player_name?: string
    position?: string
    team?: string
  }
}

export interface SyncStatus {
  lastSync: Date | null
  picksCount: number
  error: string | null
  isPolling: boolean
}

export interface LogEntry {
  timestamp: Date
  message: string
  type: 'info' | 'error' | 'success'
}

export interface DraftPick {
  pickNo: number
  pickDisplay: string // e.g., "2.09"
  playerName: string
  position: string
  team: string
  pickedBy: string
  isMyPick: boolean
}

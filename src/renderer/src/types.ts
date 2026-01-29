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

// ============================================================
// Standings Types (from sleeperStandings)
// ============================================================

export type ActiveTab = 'board' | 'myteam' | 'standings'
export type StandingsSubTab = 'bestball' | 'pwopr' | 'pwrb' | 'power'
export type PWOPRDataStrategy = 'current-week' | 'recent-average' | 'season-average'

export interface NFLState {
  week: number
  leg: number
  season: string
  season_type: string
  league_season: string
  previous_season: string
  season_start_date: string
  display_week: number
  league_create_season: string
  season_has_scores: boolean
}

export interface MetaRow {
  pandascore_id: string | null
  kalshi_id: string | null
  stats_id: string | null
  practice_participation: string | null
  espn_id: string | null
  gsis_id: string | null
  player_id: string
  weight: string | null
  college: string | null
  active: boolean
  news_updated: number
  number: number
  birth_date: string
  hashtag: string | null
  injury_notes: string | null
  search_last_name: string
  first_name: string
  rotowire_id: number
  status: string
  last_name: string
  search_rank: number
  full_name: string
  sportradar_id: string
  depth_chart_order: number
  oddsjam_id: string
  depth_chart_position: string
  search_first_name: string
  yahoo_id: string | null
  opta_id: string | null
  competitions: string[]
  fantasy_positions: string[]
  birth_state: string | null
  height: string
  swish_id: number
  search_full_name: string
  team: string
  metadata: {
    channel_id: string
    rookie_year: string
  }
  team_abbr: string | null
  rotoworld_id: string | null
  injury_status: string | null
  injury_start_date: string | null
  practice_description: string | null
  age: number
  high_school: string
  years_exp: number
  birth_country: string | null
  position: string
  team_changed_at: string | null
  birth_city: string | null
  injury_body_part: string | null
  sport: string
  fantasy_data_id: string | null
}

export interface StatRow {
  pos_rank_std: number
  gp: number
  tm_def_snp: number
  first_td: number
  gms_active: number
  rec_td: number
  rec_ypt: number
  pos_rank_half_ppr: number
  bonus_fd_wr: number
  st_snp: number
  pts_std: number
  rec_lng: number
  tm_st_snp: number
  rec: number
  rec_yar: number
  rec_fd: number
  rec_5_9: number
  bonus_rec_wr: number
  gs: number
  tm_off_snp: number
  pos_rank_ppr: number
  rec_rz_tgt: number
  off_snp: number
  pts_half_ppr: number
  rec_air_yd: number
  rec_ypr: number
  rec_10_19: number
  rec_td_lng: number
  rush_rec_yd: number
  anytime_tds: number
  rec_tgt: number
  pts_ppr: number
  rec_yd: number
  rush_att?: number
  rush_yd?: number
  rush_yac?: number
  rush_ypa?: number
  rush_lng?: number
  rush_td?: number
  rush_td_lng?: number
  rush_rz_att?: number
  pass_rush_yd?: number
  st_tkl_solo?: number
}

export type MetaMap = Record<string, MetaRow>
export type StatMap = Record<string, StatRow>

export interface PlayerProjection {
  player_id: string
  pos: string
  proj: number
  pts_ppr?: number
  pts?: number
  fp_ppr?: number
  stats?: {
    pts_ppr?: number
  }
  ppr?: number
  position?: string
  player?: {
    id: string
  }
  id?: string
  playerId?: string
  fantasy_points_ppr?: number
  points_ppr?: number
  proj_ppr?: number
  projections?: {
    pts_ppr?: number
  }
}

export interface ESPNProjectionsRow {
  full_nm: string
  tm: string
  overall: number | null
  open_score?: number | null
  catch_score?: number | null
  yac_score?: number | null
  rtm_routes?: number | null
  rtm_targets?: number | null
  yds?: number | null
}

export interface WoprRow {
  player_id: string
  name: string
  team: string
  pos: string
  targets: number
  airYards: number
  teamTargets: number
  teamAirYards: number
  targetShare: number
  airYardShare: number
  wopr: number
  pwopr: number
  fantasyProjection: number | null
  pts_ppr: number | null
}

export interface ScoredWoprRow extends WoprRow {
  expected: number
  deltaExpVsProj: number
  signal: 'Over (Strong)' | 'Over' | 'Neutral' | 'Under' | 'Under (Strong)'
  model: 'global' | 'byPos'
  modelN: number
  modelR2: number
}

export interface BaseRow {
  player_id: string
  name: string
  team: string
  pos: string
  targets: number
  airYards: number
  teamTargets: number
  teamAirYards: number
  targetShare: number
  airYardShare: number
  wopr: number
  overall: number | null
  priorYearPPG: number | null
  fantasyProjection: number | null
  pts_ppr: number | null
}

export interface SleeperProjection {
  status: string | null
  date: string
  stats: {
    adp_dd_ppr: number
    bonus_rec_wr?: number
    bonus_rec_te?: number
    bonus_rec_rb?: number
    def_fum_td: number
    def_kr_yd?: number
    def_kr_td?: number
    fum: number
    fum_lost: number
    gp: number
    pos_adp_dd_ppr: number
    pr?: number
    pr_yd?: number
    pts_half_ppr: number
    pts_ppr: number
    pts_std: number
    rec: number
    rec_0_4: number
    rec_10_19: number
    rec_20_29: number
    rec_2pt: number
    rec_30_39: number
    rec_40p: number
    rec_5_9: number
    rec_fd: number
    rec_td: number
    rec_tgt: number
    rec_yd: number
    rush_2pt?: number
    rush_40p?: number
    rush_att?: number
    rush_fd?: number
    rush_td?: number
    rush_yd?: number
  }
  category: string
  last_modified: number
  week: number
  sport: string
  season_type: string
  season: string
  player: {
    fantasy_positions: string[]
    first_name: string
    injury_body_part: string | null
    injury_notes: string | null
    injury_start_date: string | null
    injury_status: string | null
    last_name: string
    metadata: {
      channel_id: string
      rookie_year?: string
      [key: string]: unknown
    }
    news_updated: number
    position: string
    team: string
    team_abbr: string | null
    team_changed_at: string | null
    years_exp: number
  }
  team: string
  player_id: string
  updated_at: number
  game_id: string
  company: string
  opponent: string
}

export interface RBInputs {
  teamRushAttempts: number
  playerRushAttempts: number
  teamRBTargets: number
  playerTargets: number
  games: number
  yardsCreatedPerTouch?: number
  missedTacklesForced?: number
  touches?: number
  breakawayRuns?: number
  rushAttempts?: number
  successfulRushes?: number
  routesRun?: number
  age: number
  role: 'lead' | 'committee' | 'backup'
}

export interface PWRBWeights {
  WOR: number
  CEI: number
  RWO: number
  Stability: number
  rushShareWeight: number
  targetShareWeight: number
  ceiYardsCreated: number
  ceiMissedTacklesPerTouch: number
  ceiBreakawayRate: number
  ceiSuccessRate: number
  rwoPerTarget: number
  agePenaltyPerYearOver25: number
}

export interface PWRBOutput {
  wor: number
  cei: number
  rwo: number
  stability: number
  ageMultiplier: number
  blended: number
  pwrb: number
  supporting: Record<string, number>
}

export interface WeeklyRBRow {
  id: string
  name?: string
  anytime_tds?: number
  gms_active?: number
  gp?: number
  off_snp?: number
  pass_rush_yd?: number
  pos_rank_half_ppr?: number
  pos_rank_ppr?: number
  pos_rank_std?: number
  pts_half_ppr?: number
  pts_ppr?: number
  pts_std?: number
  rush_att?: number
  rush_lng?: number
  rush_rec_yd?: number
  rush_rz_att?: number
  rush_td?: number
  rush_td_lng?: number
  rush_yac?: number
  rush_yd?: number
  rush_ypa?: number
  st_snp?: number
  st_tkl_solo?: number
  tm_def_snp?: number
  tm_off_snp?: number
  tm_st_snp?: number
  age?: number
}

export interface TeamRow {
  teamId: string
  gp?: number
  rush_att?: number
  rec_tgt?: number
  rush_yac?: number
  pass_att?: number
}

export interface WeeklyAdapterOptions {
  teamRushAttemptsOverride?: Record<string, number>
  estTeamRushRate?: number
  leadSnapShare?: number
  committeeSnapShare?: number
}

export type Scoring = Record<string, number>

// League data types
export interface SleeperLeague {
  league_id: string
  name: string
  status: string
  sport: string
  season: string
  season_type: string
  total_rosters: number
  roster_positions: string[]
  scoring_settings: Record<string, number>
  settings: {
    playoff_teams?: number
    [key: string]: unknown
  }
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string
  players: string[]
  starters: string[]
  reserve: string[] | null
  taxi: string[] | null
  settings: {
    wins: number
    losses: number
    ties: number
    fpts: number
    fpts_decimal?: number
    fpts_against?: number
    fpts_against_decimal?: number
    ppts?: number
    ppts_decimal?: number
  }
}

export interface SleeperUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: {
    team_name?: string
    [key: string]: unknown
  }
}

export interface LeagueData {
  league: SleeperLeague
  rosters: SleeperRoster[]
  users: SleeperUser[]
  playersMeta: MetaMap
}

// Best Ball types
export interface BestBallProjection {
  rosterId: number
  ownerName: string
  ytdPoints: number
  projectedPoints: number
  totalPoints: number
  rank: number
  draftOrder?: number
}

// PWOPR display types
export interface PWOPRDisplayRow {
  rank: number
  name: string
  team: string
  pos: string
  pwopr: number
  floor: number
  ceiling: number
  consistency: number
  tier: string
  trend?: 'up' | 'down' | 'stable'
  sleeperProj?: number
  injuryStatus?: string | null
}

// PWRB display types
export interface PWRBDisplayRow {
  rank: number
  name: string
  team: string
  pwrb: number
  wor: number
  cei: number
  rwo: number
  floor: number
  ceiling: number
  tier: string
  trend?: 'up' | 'down' | 'stable'
  age?: number
  role?: string
}

// Power Rankings types
export interface PowerRankingTeam {
  rank: number
  rosterId: number
  ownerName: string
  teamName?: string
  totalValue: number
  qbValue: number
  rbValue: number
  wrValue: number
  teValue: number
  pickValue: number
}

export interface KTCPlayer {
  name: string
  value: number
  position: string
  team?: string
}

/**
 * RTM (Receiver Tracking Metrics) Data Manager
 * Handles fetching and caching of RTM data using localStorage for browser environment
 */

import type { ESPNProjectionsRow, PWOPRDataStrategy } from '../types'

const RTM_DATA_URL = 'https://nfl-player-metrics.s3.amazonaws.com/rtm/rtm_data.json'
const CACHE_KEY_PREFIX = 'rtm_data_week_'
const CACHE_TIMESTAMP_KEY = 'rtm_cache_timestamp'
const CACHE_MAX_AGE_HOURS = 24

/**
 * Configuration for RTM data fetching
 */
export interface RTMFetcherConfig {
  autoFetch: boolean
  maxCacheAgeHours: number
  saveToCache: boolean
}

const DEFAULT_CONFIG: RTMFetcherConfig = {
  autoFetch: true,
  maxCacheAgeHours: CACHE_MAX_AGE_HOURS,
  saveToCache: true,
}

/**
 * Check if cached data is stale
 */
function isCacheStale(week: number, maxAgeHours: number): boolean {
  const timestampKey = `${CACHE_TIMESTAMP_KEY}_${week}`
  const timestamp = localStorage.getItem(timestampKey)

  if (!timestamp) return true

  const ageMs = Date.now() - parseInt(timestamp, 10)
  const ageHours = ageMs / (1000 * 60 * 60)
  return ageHours > maxAgeHours
}

/**
 * Get cached RTM data from localStorage
 */
function getCachedData(week: number): ESPNProjectionsRow[] | null {
  const cacheKey = `${CACHE_KEY_PREFIX}${week}`
  const cached = localStorage.getItem(cacheKey)

  if (!cached) return null

  try {
    return JSON.parse(cached) as ESPNProjectionsRow[]
  } catch {
    return null
  }
}

/**
 * Save RTM data to localStorage cache
 */
function saveToCache(data: ESPNProjectionsRow[], week: number): void {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${week}`
    const timestampKey = `${CACHE_TIMESTAMP_KEY}_${week}`

    localStorage.setItem(cacheKey, JSON.stringify(data))
    localStorage.setItem(timestampKey, Date.now().toString())
    console.log(`Cached RTM data for week ${week}`)
  } catch (error) {
    console.warn('Failed to cache RTM data:', error)
  }
}

/**
 * Fetch RTM data from remote URL
 */
async function fetchFromRemote(): Promise<ESPNProjectionsRow[]> {
  console.log(`Fetching RTM data from remote: ${RTM_DATA_URL}`)

  const response = await fetch(RTM_DATA_URL)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()

  if (!Array.isArray(data)) {
    throw new Error('Invalid data format: expected array')
  }

  console.log(`Successfully fetched ${data.length} players from remote`)
  return data as ESPNProjectionsRow[]
}

/**
 * Validate RTM data structure
 */
export function validateRTMData(data: ESPNProjectionsRow[]): boolean {
  if (!Array.isArray(data)) {
    console.error('RTM data must be an array')
    return false
  }

  if (data.length === 0) {
    console.warn('RTM data is empty')
    return false
  }

  const requiredFields = ['full_nm', 'tm', 'overall']
  const sample = data[0]

  for (const field of requiredFields) {
    if (!(field in sample)) {
      console.error(`RTM data missing required field: ${field}`)
      return false
    }
  }

  return true
}

/**
 * Create a normalized key for player matching
 */
export function createPlayerKey(name: string, team: string): string {
  const normalize = (s: string) => s.replace(/[^A-Z]/gi, '').toUpperCase()
  return `${normalize(name)}|${team.toUpperCase()}`
}

/**
 * Fetch RTM data with smart caching
 */
export async function fetchRTMData(
  week: number,
  config: Partial<RTMFetcherConfig> = {}
): Promise<ESPNProjectionsRow[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // Check if we have fresh cache
  const cacheIsStale = isCacheStale(week, mergedConfig.maxCacheAgeHours)
  const cachedData = getCachedData(week)

  if (cachedData && !cacheIsStale) {
    console.log(`Using cached RTM data for week ${week}`)
    return cachedData
  }

  // Auto-fetch is disabled and cache is stale/missing
  if (!mergedConfig.autoFetch) {
    if (cachedData) {
      console.warn(`RTM cache is stale but auto-fetch is disabled. Using stale cache.`)
      return cachedData
    }
    throw new Error('RTM data not available: no cache and auto-fetch disabled')
  }

  // Fetch from remote
  try {
    const data = await fetchFromRemote()

    if (!validateRTMData(data)) {
      throw new Error('Fetched data validation failed')
    }

    // Save to cache if enabled
    if (mergedConfig.saveToCache) {
      saveToCache(data, week)
    }

    return data
  } catch (error) {
    // If fetch failed but we have stale cache, use it as fallback
    if (cachedData) {
      console.warn(`Fetch failed, falling back to stale cache`)
      return cachedData
    }
    throw error
  }
}

/**
 * Load RTM data for a specific week with fallback strategy
 */
export async function loadWeeklyRTMData(week: number): Promise<ESPNProjectionsRow[]> {
  // Try current week first
  try {
    const data = await fetchRTMData(week)
    if (data.length > 0) {
      return data
    }
  } catch {
    console.warn(`Failed to load RTM data for week ${week}, trying fallback`)
  }

  // Try previous weeks as fallback
  for (let w = week - 1; w >= 1; w--) {
    const cachedData = getCachedData(w)
    if (cachedData && cachedData.length > 0) {
      console.log(`Using week ${w} RTM data as fallback`)
      return cachedData
    }
  }

  // Last resort: fetch fresh data regardless of week
  try {
    return await fetchFromRemote()
  } catch (error) {
    console.error('No RTM data available')
    return []
  }
}

/**
 * Get list of available cached weeks
 */
export function getAvailableWeeks(): number[] {
  const weeks: number[] = []

  for (let week = 1; week <= 18; week++) {
    const cached = getCachedData(week)
    if (cached && cached.length > 0) {
      weeks.push(week)
    }
  }

  return weeks.sort((a, b) => a - b)
}

/**
 * Load and average RTM data across multiple weeks
 */
export async function loadSeasonAveragedRTMData(
  currentWeek: number,
  weeksToAverage?: number
): Promise<ESPNProjectionsRow[]> {
  const availableWeeks = getAvailableWeeks()
  const weeksToUse = weeksToAverage
    ? availableWeeks.slice(-weeksToAverage)
    : availableWeeks

  if (weeksToUse.length === 0) {
    console.warn('No weekly data available for season averaging')
    return await loadWeeklyRTMData(currentWeek)
  }

  console.log(`Averaging RTM data across weeks: ${weeksToUse.join(', ')}`)

  // Load data for each week
  const weeklyData: ESPNProjectionsRow[][] = []
  for (const week of weeksToUse) {
    const weekData = getCachedData(week)
    if (weekData && weekData.length > 0) {
      weeklyData.push(weekData)
    }
  }

  if (weeklyData.length === 0) {
    console.error('No valid weekly data found for averaging')
    return []
  }

  // Create a map to aggregate data by player
  const playerMap = new Map<
    string,
    {
      overall: number[]
      open_score: number[]
      catch_score: number[]
      yac_score: number[]
      rtm_routes: number[]
      rtm_targets: number[]
      yds: number[]
      count: number
      player: ESPNProjectionsRow
    }
  >()

  // Aggregate data across weeks
  for (const weekData of weeklyData) {
    for (const player of weekData) {
      const key = createPlayerKey(player.full_nm, player.tm)
      const existing = playerMap.get(key)

      if (existing) {
        existing.overall.push(player.overall || 0)
        existing.open_score.push(player.open_score || 0)
        existing.catch_score.push(player.catch_score || 0)
        existing.yac_score.push(player.yac_score || 0)
        existing.rtm_routes.push(player.rtm_routes || 0)
        existing.rtm_targets.push(player.rtm_targets || 0)
        existing.yds.push(player.yds || 0)
        existing.count++
      } else {
        playerMap.set(key, {
          overall: [player.overall || 0],
          open_score: [player.open_score || 0],
          catch_score: [player.catch_score || 0],
          yac_score: [player.yac_score || 0],
          rtm_routes: [player.rtm_routes || 0],
          rtm_targets: [player.rtm_targets || 0],
          yds: [player.yds || 0],
          count: 1,
          player: player,
        })
      }
    }
  }

  // Calculate averages
  const averagedData: ESPNProjectionsRow[] = []
  for (const data of playerMap.values()) {
    const avg = (arr: number[]) => arr.reduce((sum, val) => sum + val, 0) / arr.length

    averagedData.push({
      ...data.player,
      overall: Math.round(avg(data.overall)),
      open_score: Math.round(avg(data.open_score)),
      catch_score: Math.round(avg(data.catch_score)),
      yac_score: Math.round(avg(data.yac_score)),
      rtm_routes: Math.round(avg(data.rtm_routes)),
      rtm_targets: Math.round(avg(data.rtm_targets)),
      yds: Math.round(avg(data.yds)),
    })
  }

  console.log(
    `Created season-averaged data for ${averagedData.length} players across ${weeksToUse.length} weeks`
  )
  return averagedData
}

/**
 * Determine the best data loading strategy based on current week
 */
export function getDataLoadingStrategy(
  currentWeek: number
): { strategy: PWOPRDataStrategy; weeksToAverage?: number } {
  if (currentWeek <= 4) {
    return { strategy: 'season-average', weeksToAverage: undefined }
  } else if (currentWeek <= 12) {
    return { strategy: 'recent-average', weeksToAverage: 4 }
  } else {
    return { strategy: 'current-week', weeksToAverage: 1 }
  }
}

/**
 * Clear all RTM cache
 */
export function clearRTMCache(): void {
  for (let week = 1; week <= 18; week++) {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${week}`)
    localStorage.removeItem(`${CACHE_TIMESTAMP_KEY}_${week}`)
  }
  console.log('RTM cache cleared')
}

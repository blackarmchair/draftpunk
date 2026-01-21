import { RankingRow } from '../types'
import { normalizeName } from './normalizeName'
import { applyAlias } from '../data/aliases'

interface CSVRow {
  [key: string]: string
}

/**
 * Parse CSV content into RankingRow objects
 */
export function parseCSV(content: string): RankingRow[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim())

  if (lines.length === 0) {
    return []
  }

  // Parse header
  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine)

  // Create a case-insensitive header map
  const headerMap = new Map<string, number>()
  headers.forEach((header, index) => {
    headerMap.set(header.toLowerCase().trim(), index)
  })

  // Find column indices
  const nameIdx = findHeaderIndex(headerMap, ['name'])
  const tierIdx = findHeaderIndex(headerMap, ['tier'])
  const posIdx = findHeaderIndex(headerMap, ['pos', 'position'])
  const assetTypeIdx = findHeaderIndex(headerMap, ['assettype', 'asset_type'])

  if (nameIdx === -1 || tierIdx === -1 || posIdx === -1) {
    throw new Error('CSV must contain columns: name, tier, and pos/position')
  }

  // Parse data rows
  const rankings: RankingRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)

    if (values.length > nameIdx && values.length > tierIdx && values.length > posIdx) {
      const name = values[nameIdx]?.trim() || ''
      const tier = values[tierIdx]?.trim() || ''
      const position = values[posIdx]?.trim() || ''
      const assetType = assetTypeIdx !== -1 ? values[assetTypeIdx]?.trim() : undefined

      if (name) {
        const normalizedName = applyAlias(normalizeName(name))

        rankings.push({
          name,
          tier,
          position,
          assetType,
          taken: false,
          normalizedName
        })
      }
    }
  }

  return rankings
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)

  return values.map(v => v.trim().replace(/^"|"$/g, ''))
}

/**
 * Find header index by trying multiple possible names
 */
function findHeaderIndex(headerMap: Map<string, number>, possibleNames: string[]): number {
  for (const name of possibleNames) {
    const idx = headerMap.get(name.toLowerCase())
    if (idx !== undefined) {
      return idx
    }
  }
  return -1
}

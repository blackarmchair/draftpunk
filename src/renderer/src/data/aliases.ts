/**
 * Manual alias map for player name variations
 * Key: normalized name variant -> Value: canonical normalized name
 */
export const nameAliases: Record<string, string> = {
  // Common variations and punctuation issues
  'd k metcalf': 'dk metcalf',
  'dak metcalf': 'dk metcalf',
  'gabe davis': 'gabriel davis',
  'ken walker': 'kenneth walker',
  'kenny walker': 'kenneth walker',
  'aj brown': 'a j brown',
  'a j brown': 'aj brown',
  'cj stroud': 'c j stroud',
  'c j stroud': 'cj stroud',
  'dk metcalf': 'd k metcalf',
  'brian robinson': 'brian robinson',
  'brob': 'brian robinson',
  'bijan': 'bijan robinson',
  'breece': 'breece hall',
  'amon ra st brown': 'amonra st brown',
  'amon ra stbrown': 'amonra st brown',
  'devonta smith': 'devonta smith',
  'de vonta smith': 'devonta smith',
  'devon achane': 'de von achane',
  'deandre hopkins': 'de andre hopkins',
  'deandre swift': 'de andre swift',
  'deebo samuel': 'deebo samuel',
  'dj moore': 'd j moore',
  'd j moore': 'dj moore',
  'jk dobbins': 'j k dobbins',
  'j k dobbins': 'jk dobbins',
  'tj hockenson': 't j hockenson',
  't j hockenson': 'tj hockenson',
  // Add more aliases as needed
}

/**
 * Apply alias mapping to a normalized name
 */
export function applyAlias(normalizedName: string): string {
  return nameAliases[normalizedName] || normalizedName
}

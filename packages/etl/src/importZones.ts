import { readFileSync } from 'fs'
import { Pool } from 'pg'
import type { Resource, ZoneType } from '@ao-mapper/shared'

const DEFAULT_WORLD_JSON_PATH =
  'C:\\Users\\xadministrator\\Documents\\Repo\\ao-mapper\\refs\\ao-bin-dumps\\formatted\\world.json'
const DEFAULT_MAPS_JSON_PATH =
  'C:\\Users\\xadministrator\\Documents\\Repo\\ao-mapper\\refs\\avalon-roads\\src\\data\\maps.json'

const BATCH_SIZE = 100

interface WorldEntry {
  Index: string
  UniqueName: string
}

interface MapResource {
  type: string
  size: string
  count: number
}

interface MapEntry {
  id: number
  name: string
  tier: number
  image: string
  resources: MapResource[]
  chests: MapResource[]
  dungeons: MapResource[]
}

interface MapsJson {
  maps: MapEntry[]
}

interface ZoneRecord {
  uniqueName: string
  displayName: string
  tier: number
  zoneType: ZoneType
  resources: Resource[]
  cityDistance: unknown[]
  metadata: Record<string, unknown>
}

interface ImportZonePaths {
  worldJsonPath: string
  mapsJsonPath: string
}

function classifyZoneType(uniqueName: string): ZoneType {
  if (uniqueName.includes('PLAYERCITY_SAFEAREA')) return 'royal'
  if (uniqueName.includes('TUNNEL') || uniqueName.includes('ROADS_')) return 'roads'
  if (uniqueName.includes('_BLACK_') || uniqueName.includes('PLAYERCITY_BLACK')) return 'black'
  if (uniqueName.includes('_RED_')) return 'red'
  if (uniqueName.includes('_YELLOW_')) return 'yellow'
  if (uniqueName.includes('SAFEAREA')) return 'blue'
  return 'unknown'
}

function extractTier(uniqueName: string): number {
  const match = uniqueName.match(/_T(\d)_/)
  return match ? parseInt(match[1], 10) : 0
}

function shouldSkipEntry(index: string): boolean {
  if (index === 'Debug') return true
  if (index.startsWith('ISLAND-')) return true
  if (index.startsWith('PLAYERISLAND')) return true
  if (index.startsWith('HIDEOUT')) return true
  if (index.includes('STAGING')) return true
  return false
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/_t_\d+$/i, '')
    .replace(/_t\d+$/i, '')
    .trim()
}

function buildMapsIndex(maps: MapEntry[]): Map<string, MapEntry> {
  const index = new Map<string, MapEntry>()
  for (const entry of maps) {
    index.set(normalizeName(entry.name), entry)
  }
  return index
}

function mapResourcesToZoneResources(
  resources: MapResource[],
  zoneTier: number
): Resource[] {
  return resources.map((r) => ({
    type: r.type,
    tier: zoneTier > 0 ? zoneTier : 0,
  }))
}

function buildZoneRecord(
  entry: WorldEntry,
  mapsIndex: Map<string, MapEntry>
): ZoneRecord {
  const zoneType = classifyZoneType(entry.UniqueName)
  let tier = extractTier(entry.UniqueName)

  const normalized = normalizeName(entry.Index)
  const mapMatch = mapsIndex.get(normalized)

  if (tier === 0 && mapMatch) {
    tier = mapMatch.tier
  }

  const resources: Resource[] = mapMatch
    ? mapResourcesToZoneResources(mapMatch.resources, tier)
    : []

  const metadata: Record<string, unknown> = mapMatch
    ? {
        image: mapMatch.image,
        chests: mapMatch.chests,
        dungeons: mapMatch.dungeons,
      }
    : {}

  return {
    uniqueName: entry.UniqueName,
    displayName: entry.Index,
    tier,
    zoneType,
    resources,
    cityDistance: [],
    metadata,
  }
}

const UPSERT_SQL = `
INSERT INTO zones (unique_name, display_name, tier, zone_type, resources, city_distance, metadata)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
ON CONFLICT (unique_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  tier = EXCLUDED.tier,
  zone_type = EXCLUDED.zone_type,
  resources = EXCLUDED.resources,
  metadata = EXCLUDED.metadata
`

async function upsertBatch(pool: Pool, records: ZoneRecord[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const record of records) {
      await client.query(UPSERT_SQL, [
        record.uniqueName,
        record.displayName,
        record.tier,
        record.zoneType,
        JSON.stringify(record.resources),
        JSON.stringify(record.cityDistance),
        JSON.stringify(record.metadata),
      ])
    }
    await client.query('COMMIT')
  } catch (err: unknown) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function readJsonFile<T>(path: string): T {
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as T
}

export async function importZones(
  pool: Pool,
  paths: ImportZonePaths = {
    worldJsonPath: DEFAULT_WORLD_JSON_PATH,
    mapsJsonPath: DEFAULT_MAPS_JSON_PATH,
  }
): Promise<number> {
  const world = readJsonFile<WorldEntry[]>(paths.worldJsonPath)
  const mapsJson = readJsonFile<MapsJson>(paths.mapsJsonPath)
  const mapsIndex = buildMapsIndex(mapsJson.maps)

  const filtered = world.filter((entry) => !shouldSkipEntry(entry.Index))
  const records = filtered.map((entry) => buildZoneRecord(entry, mapsIndex))

  const total = records.length
  let imported = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    await upsertBatch(pool, batch)
    imported += batch.length
    console.log(`Imported ${imported}/${total} zones...`)
  }

  return imported
}

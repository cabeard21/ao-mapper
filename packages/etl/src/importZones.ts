import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { Pool } from 'pg'
import type { CityDistance, Resource, ZoneType } from '@ao-mapper/shared'

const REPO_ROOT = path.resolve(__dirname, '../../../')
const DEFAULT_WORLD_JSON_PATH = path.join(REPO_ROOT, 'refs/ao-bin-dumps/formatted/world.json')
const DEFAULT_MAPS_JSON_PATH = path.join(REPO_ROOT, 'refs/avalon-roads/src/data/maps.json')
const DEFAULT_CLUSTER_DIR = path.join(REPO_ROOT, 'refs/ao-bin-dumps/cluster')
const DEFAULT_AFM_LOCATIONS_URL = 'https://cdn.albionfreemarket.com/AlbionWorld/albionLocations.json'

const BATCH_SIZE = 100
const KNOWN_CITY_NAMES = [
  'Bridgewatch',
  'Caerleon',
  'Fort Sterling',
  'Lymhurst',
  'Martlock',
  'Thetford',
  'Brecilien',
]

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
  cityDistance: CityDistance[]
  metadata: Record<string, unknown>
}

interface ClusterInfo {
  tier: number
  zoneType: ZoneType
}

interface ImportZonePaths {
  worldJsonPath: string
  mapsJsonPath: string
  clusterDir: string
  afmLocationsUrl?: string
}

type Point = [number, number]

interface AfmPortalEdge {
  id?: string
  targetId?: string
  targetLocationId?: string
  position?: Point
  kind?: string
}

interface AfmLocation {
  id: string
  imageFile?: string
  displayName: string
  pvpCategory?: string
  mapCategory?: string
  minimapBoundsMin?: Point
  minimapBoundsMax?: Point
  worldmapposition?: Point | null
  exits?: AfmPortalEdge[]
  portalEntrances?: AfmPortalEdge[]
  portalExits?: AfmPortalEdge[]
}

interface AfmJoinResult {
  matchedByZoneName: Map<string, AfmLocation>
  stats: {
    fetched: number
    matched: number
    unmatched: number
    ambiguousLocationNames: number
    ambiguousZoneNames: number
  }
}

interface WeightedEdge {
  to: string
  weight: number
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

function clusterPvpTypeToZoneType(pvpType: string, tier: number): ZoneType {
  if (pvpType === 'NON') return 'royal'
  if (pvpType === 'OUT') return 'black'
  if (pvpType === 'MIS') return 'roads'
  if (pvpType === 'AVA') return 'roads'
  if (pvpType === 'ROY') {
    if (tier <= 4) return 'blue'
    if (tier <= 6) return 'yellow'
    return 'red'
  }
  return 'unknown'
}

function buildClusterIndex(clusterDir: string): Map<string, ClusterInfo> {
  const index = new Map<string, ClusterInfo>()
  const files = readdirSync(clusterDir).filter((f) => f.endsWith('.cluster.xml'))

  for (const file of files) {
    const parts = file.replace('.cluster.xml', '').split('_')
    const zoneIndex = parts[0]
    if (!/^\d+$/.test(zoneIndex) && !/^[A-Z]+-\d+$/.test(zoneIndex)) continue

    const tierPart = parts.find((p) => /^T\d$/.test(p))
    if (!tierPart) continue
    const tier = parseInt(tierPart.slice(1), 10)

    // Last segment is either PvP type (ROY/OUT/MIS/NON) or a quadrant (Q1-Q6).
    // If it's a quadrant, the PvP type is the segment before it.
    const last = parts[parts.length - 1]
    const pvpType = /^Q\d$/.test(last) ? parts[parts.length - 2] : last

    if (!index.has(zoneIndex)) {
      index.set(zoneIndex, { tier, zoneType: clusterPvpTypeToZoneType(pvpType, tier) })
    }
  }

  return index
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

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function isAfmEdge(value: unknown): value is AfmPortalEdge {
  if (typeof value !== 'object' || value === null) return false
  const edge = value as AfmPortalEdge
  return (
    typeof edge.targetLocationId === 'string' &&
    (edge.position === undefined || isPoint(edge.position))
  )
}

function asAfmEdges(value: unknown): AfmPortalEdge[] {
  return Array.isArray(value) ? value.filter(isAfmEdge) : []
}

function isAfmLocation(value: unknown): value is AfmLocation {
  if (typeof value !== 'object' || value === null) return false
  const location = value as AfmLocation
  return typeof location.id === 'string' && typeof location.displayName === 'string'
}

function parseAfmLocations(value: unknown): AfmLocation[] {
  const rawLocations = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as { locations?: unknown }).locations)
      ? (value as { locations: unknown[] }).locations
      : []

  return rawLocations.filter(isAfmLocation).map((location) => ({
    ...location,
    exits: asAfmEdges(location.exits),
    portalEntrances: asAfmEdges(location.portalEntrances),
    portalExits: asAfmEdges(location.portalExits),
  }))
}

async function fetchAfmLocations(url: string): Promise<AfmLocation[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`AFM locations fetch failed with HTTP ${response.status}`)
  }
  return parseAfmLocations(await response.json())
}

async function loadAfmLocations(url: string): Promise<AfmLocation[]> {
  try {
    const locations = await fetchAfmLocations(url)
    console.log(`Fetched ${locations.length} AFM locations.`)
    return locations
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`AFM locations unavailable; importing zones without AFM metadata or city distances. ${message}`)
    return []
  }
}

function buildUniqueByDisplayName<T extends { displayName: string }>(
  entries: T[]
): { unique: Map<string, T>; ambiguousCount: number } {
  const grouped = new Map<string, T[]>()
  for (const entry of entries) {
    grouped.set(entry.displayName, [...(grouped.get(entry.displayName) ?? []), entry])
  }

  const unique = new Map<string, T>()
  let ambiguousCount = 0
  for (const [displayName, matches] of grouped) {
    if (matches.length === 1) {
      unique.set(displayName, matches[0])
    } else {
      ambiguousCount += matches.length
    }
  }
  return { unique, ambiguousCount }
}

function joinAfmLocations(records: ZoneRecord[], locations: AfmLocation[]): AfmJoinResult {
  if (locations.length === 0) {
    return {
      matchedByZoneName: new Map(),
      stats: {
        fetched: 0,
        matched: 0,
        unmatched: 0,
        ambiguousLocationNames: 0,
        ambiguousZoneNames: 0,
      },
    }
  }

  const afmByName = buildUniqueByDisplayName(locations)
  const zonesByName = buildUniqueByDisplayName(records)
  const matchedByZoneName = new Map<string, AfmLocation>()
  let unmatched = 0

  for (const location of locations) {
    const uniqueAfm = afmByName.unique.get(location.displayName)
    const uniqueZone = zonesByName.unique.get(location.displayName)
    if (uniqueAfm === location && uniqueZone) {
      matchedByZoneName.set(uniqueZone.displayName, location)
    } else {
      unmatched += 1
    }
  }

  return {
    matchedByZoneName,
    stats: {
      fetched: locations.length,
      matched: matchedByZoneName.size,
      unmatched,
      ambiguousLocationNames: afmByName.ambiguousCount,
      ambiguousZoneNames: zonesByName.ambiguousCount,
    },
  }
}

function afmEdges(location: AfmLocation): AfmPortalEdge[] {
  return [
    ...(location.exits ?? []),
    ...(location.portalEntrances ?? []),
    ...(location.portalExits ?? []),
  ]
}

function distanceBetween(a: Point | undefined, b: Point | undefined): number {
  if (!a || !b) return 1
  return Math.max(1, Math.round(Math.hypot(a[0] - b[0], a[1] - b[1])))
}

function addWeightedEdge(
  graph: Map<string, WeightedEdge[]>,
  from: string,
  to: string,
  weight: number
): void {
  graph.set(from, [...(graph.get(from) ?? []), { to, weight }])
}

function buildAfmGraph(locations: AfmLocation[]): Map<string, WeightedEdge[]> {
  const byId = new Map(locations.map((location) => [location.id, location]))
  const edgePositionById = new Map<string, Point>()
  for (const location of locations) {
    for (const edge of afmEdges(location)) {
      if (edge.id && edge.position) {
        edgePositionById.set(edge.id, edge.position)
      }
    }
  }

  const graph = new Map<string, WeightedEdge[]>()
  for (const location of locations) {
    for (const edge of afmEdges(location)) {
      if (!edge.targetLocationId || !byId.has(edge.targetLocationId)) continue
      const targetPosition = edge.targetId ? edgePositionById.get(edge.targetId) : undefined
      addWeightedEdge(
        graph,
        location.id,
        edge.targetLocationId,
        distanceBetween(edge.position, targetPosition)
      )
    }
  }
  return graph
}

function shortestHopDistances(graph: Map<string, WeightedEdge[]>, start: string): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]])
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const currentDistance = distances.get(current) as number
    for (const edge of graph.get(current) ?? []) {
      if (distances.has(edge.to)) continue
      distances.set(edge.to, currentDistance + 1)
      queue.push(edge.to)
    }
  }
  return distances
}

function shortestMeterDistances(graph: Map<string, WeightedEdge[]>, start: string): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]])
  const visited = new Set<string>()

  while (true) {
    let current: string | null = null
    let currentDistance = Number.POSITIVE_INFINITY
    for (const [locationId, distance] of distances) {
      if (!visited.has(locationId) && distance < currentDistance) {
        current = locationId
        currentDistance = distance
      }
    }
    if (!current) break

    visited.add(current)
    for (const edge of graph.get(current) ?? []) {
      const nextDistance = currentDistance + edge.weight
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance)
      }
    }
  }

  return distances
}

function computeCityDistances(
  records: ZoneRecord[],
  locations: AfmLocation[],
  matchedByZoneName: Map<string, AfmLocation>
): Map<string, CityDistance[]> {
  const graph = buildAfmGraph(locations)
  const cityLocations = KNOWN_CITY_NAMES.flatMap((cityName) => {
    const location = matchedByZoneName.get(cityName)
    return location ? [{ cityName, location }] : []
  })
  const distancesByZoneName = new Map<string, CityDistance[]>()

  for (const record of records) {
    const location = matchedByZoneName.get(record.displayName)
    if (!location) continue

    const hopDistances = shortestHopDistances(graph, location.id)
    const meterDistances = shortestMeterDistances(graph, location.id)
    const distances = cityLocations.flatMap(({ cityName, location: cityLocation }) => {
      const hops = hopDistances.get(cityLocation.id)
      if (hops === undefined) return []
      const meters = meterDistances.get(cityLocation.id)
      return [
        {
          cityName,
          hops,
          ...(meters !== undefined ? { meters: Math.round(meters) } : {}),
        },
      ]
    })

    distancesByZoneName.set(
      record.displayName,
      distances.sort((a, b) => a.hops - b.hops || a.cityName.localeCompare(b.cityName))
    )
  }

  return distancesByZoneName
}

function buildAfmMetadata(location: AfmLocation): Record<string, unknown> {
  return {
    id: location.id,
    imageFile: location.imageFile,
    pvpCategory: location.pvpCategory,
    mapCategory: location.mapCategory,
    minimapBoundsMin: location.minimapBoundsMin,
    minimapBoundsMax: location.minimapBoundsMax,
    worldmapposition: location.worldmapposition,
    exits: location.exits ?? [],
    portalEntrances: location.portalEntrances ?? [],
    portalExits: location.portalExits ?? [],
  }
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
  mapsIndex: Map<string, MapEntry>,
  clusterIndex: Map<string, ClusterInfo>,
  duplicateIndexedDisplayNames: Set<string> = new Set()
): ZoneRecord {
  // Numeric Index (e.g. "4206") and coded Index (e.g. "TNL-001", "PSG-0039#2") both store
  // the human-readable display name in UniqueName. Text Index (e.g. "Deepwood Dell") is itself the display name.
  const isNumeric = /^\d+$/.test(entry.Index)
  const isCoded = /^[A-Z]+-\d+/.test(entry.Index)
  const isIndexedEntry = isNumeric || isCoded
  const displayName = isIndexedEntry ? entry.UniqueName : entry.Index
  const uniqueName =
    isIndexedEntry && duplicateIndexedDisplayNames.has(displayName)
      ? entry.Index
      : entry.UniqueName

  let tier = isIndexedEntry ? 0 : extractTier(entry.UniqueName)

  const normalized = normalizeName(displayName)
  const mapMatch = mapsIndex.get(normalized)
  // Coded indexes may have a #N variant suffix (e.g. "PSG-0039#2"); strip it to match the cluster filename base.
  const clusterKey = isCoded ? entry.Index.split('#')[0] : entry.Index
  const clusterData = isIndexedEntry ? clusterIndex.get(clusterKey) : undefined

  if (tier === 0 && mapMatch) tier = mapMatch.tier
  if (tier === 0 && clusterData) tier = clusterData.tier

  const zoneType: ZoneType = isIndexedEntry
    ? (clusterData?.zoneType ?? classifyZoneType(entry.UniqueName))
    : classifyZoneType(entry.UniqueName)

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
    uniqueName,
    displayName,
    tier,
    zoneType,
    resources,
    cityDistance: [],
    metadata,
  }
}

function duplicateIndexedDisplayNames(entries: WorldEntry[]): Set<string> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const isIndexedEntry = /^\d+$/.test(entry.Index) || /^[A-Z]+-\d+/.test(entry.Index)
    if (!isIndexedEntry) continue
    counts.set(entry.UniqueName, (counts.get(entry.UniqueName) ?? 0) + 1)
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([displayName]) => displayName)
  )
}

const UPSERT_SQL = `
INSERT INTO zones (unique_name, display_name, tier, zone_type, resources, city_distance, metadata)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
ON CONFLICT (unique_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  tier = EXCLUDED.tier,
  zone_type = EXCLUDED.zone_type,
  resources = EXCLUDED.resources,
  city_distance = EXCLUDED.city_distance,
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
    clusterDir: DEFAULT_CLUSTER_DIR,
  }
): Promise<number> {
  const world = readJsonFile<WorldEntry[]>(paths.worldJsonPath)
  const mapsJson = readJsonFile<MapsJson>(paths.mapsJsonPath)
  const mapsIndex = buildMapsIndex(mapsJson.maps)
  const clusterIndex = buildClusterIndex(paths.clusterDir)

  const filtered = world.filter((entry) => !shouldSkipEntry(entry.Index))
  const duplicateDisplayNames = duplicateIndexedDisplayNames(filtered)
  const records = filtered.map((entry) =>
    buildZoneRecord(entry, mapsIndex, clusterIndex, duplicateDisplayNames)
  )
  const afmLocations = await loadAfmLocations(
    paths.afmLocationsUrl ?? process.env.AFM_ALBION_LOCATIONS_URL ?? DEFAULT_AFM_LOCATIONS_URL
  )
  const afmJoin = joinAfmLocations(records, afmLocations)
  console.log(
    `AFM zone join: ${afmJoin.stats.matched} matched, ${afmJoin.stats.unmatched} skipped, ` +
      `${afmJoin.stats.ambiguousLocationNames} ambiguous AFM records, ` +
      `${afmJoin.stats.ambiguousZoneNames} ambiguous zone records.`
  )
  const cityDistancesByZoneName = computeCityDistances(records, afmLocations, afmJoin.matchedByZoneName)
  for (const record of records) {
    const afmLocation = afmJoin.matchedByZoneName.get(record.displayName)
    if (afmLocation) {
      record.metadata = {
        ...record.metadata,
        afm: buildAfmMetadata(afmLocation),
      }
      record.cityDistance = cityDistancesByZoneName.get(record.displayName) ?? []
    }
  }

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

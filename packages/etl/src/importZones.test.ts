import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importZones } from './importZones'

function createPoolMock() {
  const query = vi.fn().mockResolvedValue({ rows: [] })
  const release = vi.fn()
  const connect = vi.fn().mockResolvedValue({ query, release })

  return {
    pool: { connect },
    query,
    release,
  }
}

function writeFixtureFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mapper-etl-'))
  const worldJsonPath = join(dir, 'world.json')
  const mapsJsonPath = join(dir, 'maps.json')
  const clusterDir = mkdtempSync(join(tmpdir(), 'ao-mapper-cluster-'))

  writeFileSync(
    worldJsonPath,
    JSON.stringify([
      {
        Index: 'Deepwood Dell',
        UniqueName: 'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL',
      },
      {
        Index: 'PLAYERISLAND_LEVEL_1',
        UniqueName: 'PLAYERISLAND_LEVEL_1',
      },
      {
        Index: '9001',
        UniqueName: 'Test Black Zone',
      },
      {
        Index: '9002',
        UniqueName: 'Test Royal Zone',
      },
    ])
  )
  writeFileSync(
    mapsJsonPath,
    JSON.stringify({
      maps: [
        {
          id: 1,
          name: 'Deepwood Dell',
          tier: 5,
          image: 'deepwood.png',
          resources: [{ type: 'fiber', size: 'small', count: 3 }],
          chests: [{ type: 'green', size: 'small', count: 1 }],
          dungeons: [{ type: 'solo', size: 'small', count: 2 }],
        },
      ],
    })
  )

  // Cluster files: only filenames matter — content is not parsed
  writeFileSync(join(clusterDir, '9001_WRL_ST_AUTO_T6_KPR_OUT_Q1.cluster.xml'), '')
  writeFileSync(join(clusterDir, '9002_WRL_MN_AUTO_T5_KPR_ROY.cluster.xml'), '')

  return { worldJsonPath, mapsJsonPath, clusterDir }
}

function writeAfmFixtureFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mapper-etl-afm-'))
  const worldJsonPath = join(dir, 'world.json')
  const mapsJsonPath = join(dir, 'maps.json')
  const clusterDir = mkdtempSync(join(tmpdir(), 'ao-mapper-cluster-afm-'))

  writeFileSync(
    worldJsonPath,
    JSON.stringify([
      {
        Index: 'Deepwood Dell',
        UniqueName: 'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL',
      },
      {
        Index: 'Bridgewatch',
        UniqueName: 'PLAYERCITY_SAFEAREA_BRIDGEWATCH',
      },
      {
        Index: 'Martlock',
        UniqueName: 'PLAYERCITY_SAFEAREA_MARTLOCK',
      },
      {
        Index: 'Unmatched Zone',
        UniqueName: 'OPEN_WORLD_T5_SAFEAREA_UNMATCHED',
      },
    ])
  )
  writeFileSync(
    mapsJsonPath,
    JSON.stringify({
      maps: [
        {
          id: 1,
          name: 'Deepwood Dell',
          tier: 5,
          image: 'deepwood.png',
          resources: [],
          chests: [],
          dungeons: [],
        },
      ],
    })
  )

  return { worldJsonPath, mapsJsonPath, clusterDir }
}

type InsertCall = [string, unknown[]]

function isInsertCall(call: unknown[]): call is InsertCall {
  return typeof call[0] === 'string' && call[0].includes('INSERT INTO zones')
}

function insertCalls(query: ReturnType<typeof vi.fn>): InsertCall[] {
  return query.mock.calls.filter(isInsertCall)
}

describe('importZones', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('imports non-skipped zones with map metadata and resources', async () => {
    const fixtures = writeFixtureFiles()
    const { pool, query, release } = createPoolMock()

    const imported = await importZones(pool as unknown as Pool, fixtures)

    expect(imported).toBe(3)
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN')
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO zones'),
      [
        'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL',
        'Deepwood Dell',
        5,
        'blue',
        JSON.stringify([{ type: 'fiber', tier: 5 }]),
        JSON.stringify([]),
        JSON.stringify({
          image: 'deepwood.png',
          chests: [{ type: 'green', size: 'small', count: 1 }],
          dungeons: [{ type: 'solo', size: 'small', count: 2 }],
        }),
      ]
    )
    expect(query).toHaveBeenCalledWith('COMMIT')
    expect(release).toHaveBeenCalledOnce()
  })

  it('derives tier and zone type from cluster filename for numeric-index zones', async () => {
    const fixtures = writeFixtureFiles()
    const { pool, query } = createPoolMock()

    await importZones(pool as unknown as Pool, fixtures)

    const calls = insertCalls(query)

    const blackZone = calls.find(([, params]) => params[0] === 'Test Black Zone')
    const royalZone = calls.find(([, params]) => params[0] === 'Test Royal Zone')

    expect(blackZone).toBeDefined()
    expect(blackZone![1]).toEqual([
      'Test Black Zone',
      'Test Black Zone',
      6,
      'black',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({}),
    ])

    expect(royalZone).toBeDefined()
    expect(royalZone![1]).toEqual([
      'Test Royal Zone',
      'Test Royal Zone',
      5,
      'yellow',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({}),
    ])
  })

  it('fetches AFM locations, joins by display name, and computes hops with meters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'deepwood',
            imageFile: 'deepwood-afm.png',
            displayName: 'Deepwood Dell',
            pvpCategory: 'blue',
            mapCategory: 'openworld',
            minimapBoundsMin: [-100, -100],
            minimapBoundsMax: [100, 100],
            worldmapposition: [10, 20],
            exits: [
              {
                id: 'deepwood-bridgewatch',
                targetId: 'bridgewatch-deepwood',
                targetLocationId: 'bridgewatch',
                position: [0, 0],
              },
            ],
            portalEntrances: [],
            portalExits: [],
          },
          {
            id: 'bridgewatch',
            imageFile: 'bridgewatch.png',
            displayName: 'Bridgewatch',
            pvpCategory: 'blue',
            mapCategory: 'city',
            exits: [
              {
                id: 'bridgewatch-deepwood',
                targetId: 'deepwood-bridgewatch',
                targetLocationId: 'deepwood',
                position: [30, 40],
              },
            ],
            portalEntrances: [
              {
                id: 'bridgewatch-martlock',
                targetId: 'martlock-bridgewatch',
                targetLocationId: 'martlock',
                position: [0, 0],
              },
            ],
            portalExits: [],
          },
          {
            id: 'martlock',
            displayName: 'Martlock',
            exits: [],
            portalEntrances: [],
            portalExits: [
              {
                id: 'martlock-bridgewatch',
                targetId: 'bridgewatch-martlock',
                targetLocationId: 'bridgewatch',
                position: [6, 8],
              },
            ],
          },
          {
            id: 'afm-unmatched',
            displayName: 'AFM Only',
            exits: [],
            portalEntrances: [],
            portalExits: [],
          },
        ],
      })
    )
    const fixtures = writeAfmFixtureFiles()
    const { pool, query } = createPoolMock()

    await importZones(pool as unknown as Pool, {
      ...fixtures,
      afmLocationsUrl: 'https://example.test/afm.json',
    })

    expect(fetch).toHaveBeenCalledWith('https://example.test/afm.json')
    const calls = insertCalls(query)
    const deepwood = calls.find(([, params]) => params[0] === 'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL')

    expect(deepwood).toBeDefined()
    expect(JSON.parse(deepwood![1][5] as string)).toEqual([
      { cityName: 'Bridgewatch', hops: 1, meters: 50 },
      { cityName: 'Martlock', hops: 2, meters: 60 },
    ])
    expect(JSON.parse(deepwood![1][6] as string)).toMatchObject({
      image: 'deepwood.png',
      afm: {
        id: 'deepwood',
        imageFile: 'deepwood-afm.png',
        pvpCategory: 'blue',
        mapCategory: 'openworld',
        minimapBoundsMin: [-100, -100],
        minimapBoundsMax: [100, 100],
        worldmapposition: [10, 20],
        exits: [
          {
            id: 'deepwood-bridgewatch',
            targetLocationId: 'bridgewatch',
            position: [0, 0],
          },
        ],
      },
    })
  })

  it('skips ambiguous AFM display-name matches without failing import', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 'first', displayName: 'Deepwood Dell', exits: [] },
          { id: 'second', displayName: 'Deepwood Dell', exits: [] },
        ],
      })
    )
    const fixtures = writeFixtureFiles()
    const { pool, query } = createPoolMock()

    await importZones(pool as unknown as Pool, fixtures)

    const calls = insertCalls(query)
    const deepwood = calls.find(([, params]) => params[0] === 'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL')

    expect(deepwood).toBeDefined()
    expect(JSON.parse(deepwood![1][5] as string)).toEqual([])
    expect(JSON.parse(deepwood![1][6] as string)).not.toHaveProperty('afm')
  })

  it('uses unmatched AFM locations as intermediate graph nodes for city distances', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'deepwood',
            displayName: 'Deepwood Dell',
            exits: [
              {
                id: 'deepwood-mid',
                targetId: 'mid-deepwood',
                targetLocationId: 'afm-mid',
                position: [0, 0],
              },
            ],
          },
          {
            id: 'afm-mid',
            displayName: 'AFM Intermediate Only',
            exits: [
              {
                id: 'mid-bridgewatch',
                targetId: 'bridgewatch-mid',
                targetLocationId: 'bridgewatch',
                position: [10, 0],
              },
            ],
          },
          {
            id: 'bridgewatch',
            displayName: 'Bridgewatch',
            exits: [
              {
                id: 'bridgewatch-mid',
                targetId: 'mid-bridgewatch',
                targetLocationId: 'afm-mid',
                position: [15, 0],
              },
            ],
          },
        ],
      })
    )
    const fixtures = writeAfmFixtureFiles()
    const { pool, query } = createPoolMock()

    await importZones(pool as unknown as Pool, fixtures)

    const calls = insertCalls(query)
    const deepwood = calls.find(([, params]) => params[0] === 'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL')

    expect(JSON.parse(deepwood![1][5] as string)).toEqual([
      { cityName: 'Bridgewatch', hops: 2, meters: 6 },
    ])
  })

  it('continues import with empty AFM metadata and city distances when AFM fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const fixtures = writeFixtureFiles()
    const { pool, query } = createPoolMock()

    const imported = await importZones(pool as unknown as Pool, fixtures)

    expect(imported).toBe(3)
    const calls = insertCalls(query)
    const deepwood = calls.find(([, params]) => params[0] === 'OPEN_WORLD_T5_SAFEAREA_DEEPWOOD_DELL')
    expect(JSON.parse(deepwood![1][5] as string)).toEqual([])
    expect(JSON.parse(deepwood![1][6] as string)).toEqual({
      image: 'deepwood.png',
      chests: [{ type: 'green', size: 'small', count: 1 }],
      dungeons: [{ type: 'solo', size: 'small', count: 2 }],
    })
  })

  it('uses UniqueName as displayName and derives roads type from cluster for TNL zones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-mapper-etl-tnl-'))
    const worldJsonPath = join(dir, 'world.json')
    const mapsJsonPath = join(dir, 'maps.json')
    const clusterDir = mkdtempSync(join(tmpdir(), 'ao-mapper-cluster-tnl-'))

    writeFileSync(worldJsonPath, JSON.stringify([{ Index: 'TNL-001', UniqueName: 'Ouyos-Aoeuam' }]))
    writeFileSync(mapsJsonPath, JSON.stringify({ maps: [] }))
    writeFileSync(join(clusterDir, 'TNL-001_RDS_FR_RED_T4_AVA_AVA.cluster.xml'), '')

    const { pool, query } = createPoolMock()
    await importZones(pool as unknown as Pool, { worldJsonPath, mapsJsonPath, clusterDir })

    const calls = insertCalls(query)
    const tnl = calls.find(([, params]) => params[0] === 'Ouyos-Aoeuam')
    expect(tnl).toBeDefined()
    expect(tnl![1]).toEqual([
      'Ouyos-Aoeuam',
      'Ouyos-Aoeuam',
      4,
      'roads',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({}),
    ])
  })

  it('uses UniqueName as displayName and derives type from cluster for PSG zones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-mapper-etl-psg-'))
    const worldJsonPath = join(dir, 'world.json')
    const mapsJsonPath = join(dir, 'maps.json')
    const clusterDir = mkdtempSync(join(tmpdir(), 'ao-mapper-cluster-psg-'))

    writeFileSync(worldJsonPath, JSON.stringify([{ Index: 'PSG-0001', UniqueName: 'Chasmlight Cave' }]))
    writeFileSync(mapsJsonPath, JSON.stringify({ maps: [] }))
    writeFileSync(join(clusterDir, 'PSG-0001_PGU_HL_AUTO_T5_NON_ROY.cluster.xml'), '')

    const { pool, query } = createPoolMock()
    await importZones(pool as unknown as Pool, { worldJsonPath, mapsJsonPath, clusterDir })

    const calls = insertCalls(query)
    const psg = calls.find(([, params]) => params[0] === 'Chasmlight Cave')
    expect(psg).toBeDefined()
    expect(psg![1]).toEqual([
      'Chasmlight Cave',
      'Chasmlight Cave',
      5,
      'yellow',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({}),
    ])
  })

  it('strips # variant suffix to resolve cluster data for PSG zones with multiple instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-mapper-etl-psg-hash-'))
    const worldJsonPath = join(dir, 'world.json')
    const mapsJsonPath = join(dir, 'maps.json')
    const clusterDir = mkdtempSync(join(tmpdir(), 'ao-mapper-cluster-psg-hash-'))

    writeFileSync(worldJsonPath, JSON.stringify([{ Index: 'PSG-0039#2', UniqueName: 'Darkseep Core' }]))
    writeFileSync(mapsJsonPath, JSON.stringify({ maps: [] }))
    writeFileSync(join(clusterDir, 'PSG-0039_PGU_MN_AUTO_T5_NON_OUT_Q2.cluster.xml'), '')

    const { pool, query } = createPoolMock()
    await importZones(pool as unknown as Pool, { worldJsonPath, mapsJsonPath, clusterDir })

    const calls = insertCalls(query)
    const psg = calls.find(([, params]) => params[0] === 'Darkseep Core')
    expect(psg).toBeDefined()
    expect(psg![1]).toEqual([
      'Darkseep Core',
      'Darkseep Core',
      5,
      'black',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({}),
    ])
  })

  it('uses Index as uniqueName for duplicate indexed display names', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-mapper-etl-duplicate-display-'))
    const worldJsonPath = join(dir, 'world.json')
    const mapsJsonPath = join(dir, 'maps.json')
    const clusterDir = mkdtempSync(join(tmpdir(), 'ao-mapper-cluster-duplicate-display-'))

    writeFileSync(
      worldJsonPath,
      JSON.stringify([
        { Index: 'BLACKBANK-2310', UniqueName: "Smuggler's Den" },
        { Index: 'BLACKBANK-0321', UniqueName: "Smuggler's Den" },
      ])
    )
    writeFileSync(mapsJsonPath, JSON.stringify({ maps: [] }))
    writeFileSync(join(clusterDir, 'BLACKBANK-2310_CTY_HL_AUTO_T6_NON.cluster.xml'), '')
    writeFileSync(join(clusterDir, 'BLACKBANK-0321_CTY_HL_AUTO_T6_NON.cluster.xml'), '')

    const { pool, query } = createPoolMock()
    await importZones(pool as unknown as Pool, { worldJsonPath, mapsJsonPath, clusterDir })

    const calls = insertCalls(query)
    expect(calls.map(([, params]) => [params[0], params[1]])).toEqual([
      ['BLACKBANK-2310', "Smuggler's Den"],
      ['BLACKBANK-0321', "Smuggler's Den"],
    ])
  })
})

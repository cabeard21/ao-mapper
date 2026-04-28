import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
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

  return { worldJsonPath, mapsJsonPath }
}

describe('importZones', () => {
  it('imports non-skipped zones with map metadata and resources', async () => {
    const fixtures = writeFixtureFiles()
    const { pool, query, release } = createPoolMock()

    const imported = await importZones(pool as unknown as Pool, fixtures)

    expect(imported).toBe(1)
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
    expect(query).toHaveBeenNthCalledWith(3, 'COMMIT')
    expect(release).toHaveBeenCalledOnce()
  })
})

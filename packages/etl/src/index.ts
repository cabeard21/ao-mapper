import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve('../../.env') })
import { Pool } from 'pg'
import { importZones } from './importZones'

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const count = await importZones(pool)
    console.log(`Done. Imported ${count} zones.`)
  } finally {
    await pool.end()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})

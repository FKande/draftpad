import dotenv from 'dotenv'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

// Apply the drizzle migrations in ./drizzle to the test database once, before
// the suite runs, so a newly generated migration never leaves the test DB
// behind the schema the code expects.
export default async function setup() {
  const { parsed } = dotenv.config({ path: '.env.test' })
  // Prefer the explicit local test config; only GitHub Actions may supply the
  // fallback through the test step's environment. Never load .env here.
  const databaseUrl = parsed?.DATABASE_URL
    ?? (process.env.GITHUB_ACTIONS === 'true' ? process.env.DATABASE_URL : undefined)

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set in .env.test or supplied by GitHub Actions')
  }

  const pool = new pg.Pool({ connectionString: databaseUrl })

  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }
}

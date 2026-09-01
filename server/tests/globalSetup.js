import dotenv from 'dotenv'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

// Apply the drizzle migrations in ./drizzle to the test database once, before
// the suite runs, so a newly generated migration never leaves the test DB
// behind the schema the code expects.
export default async function setup() {
  const { parsed } = dotenv.config({ path: '.env.test' })
  const databaseUrl = parsed?.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in .env.test')
  }

  const pool = new pg.Pool({ connectionString: databaseUrl })

  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }
}

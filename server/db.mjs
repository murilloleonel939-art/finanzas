import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL para conectar PostgreSQL.')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

export async function query(text, values) {
  return pool.query(text, values)
}

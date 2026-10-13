import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 10_000,
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected error on idle database client'));

// Anything that can run a query: the pool itself, or a client inside a
// transaction. Rows come back untyped; repositories assert the row shape they
// selected, which is the one place that knows the column list.
export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

// Runs `fn(tx)` inside a transaction. Commits on success, rolls back on any
// error, and always releases the client back to the pool.
export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'Rollback failed');
    }
    throw err;
  } finally {
    client.release();
  }
}

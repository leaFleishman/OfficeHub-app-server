import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../config/logger.js';
import { pool } from './pool.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const ADVISORY_LOCK_ID = 7_351_001;

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // Two instances starting together must not run the same migration twice.
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ migration: file }, 'Migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  migrate()
    .then(() => logger.info('Migrations up to date'))
    .catch((err: unknown) => {
      logger.error({ err }, 'Migration failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

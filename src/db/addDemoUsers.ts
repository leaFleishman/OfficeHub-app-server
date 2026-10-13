import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { pool, withTransaction } from './pool.js';

async function addDemoUsers(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to add demo users in production');
  }
  if (!env.SEED_ADMIN_PASSWORD) {
    throw new Error('Set SEED_ADMIN_PASSWORD (min 8 chars) to add demo users');
  }

  const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, env.BCRYPT_ROUNDS);

  await withTransaction(async (db) => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO companies (name, floor) VALUES ('Demo Company', 2)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const companyId = rows[0].id;

    const demoUsers: [string, string, string][] = [
      ['Demo Manager 2', 'manager2@demo.local', 'Manager'],
      ['Demo Employee 2', 'employee2@demo.local', 'Employee'],
    ];
    for (const [name, email, role] of demoUsers) {
      const result = await db.query(
        `INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ((lower(email))) DO NOTHING`,
        [companyId, name, email, hash, role],
      );
      logger.info({ email, created: result.rowCount === 1 }, 'Demo user processed');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  addDemoUsers()
    .then(() => logger.info('Additional demo users processed'))
    .catch((err: unknown) => {
      logger.error({ err }, 'Failed to add additional demo users');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

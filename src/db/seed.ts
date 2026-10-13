import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { pool, withTransaction } from './pool.js';

async function seed(): Promise<void> {
  if (!env.SEED_ADMIN_PASSWORD) throw new Error('Set SEED_ADMIN_PASSWORD (min 8 chars) to run the seed');
  const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, env.BCRYPT_ROUNDS);

  await withTransaction(async (db) => {
    await db.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('System Admin', $1, $2, 'Admin')
       ON CONFLICT ((lower(email))) DO NOTHING`,
      [env.SEED_ADMIN_EMAIL, hash],
    );
    if (env.NODE_ENV === 'production') return;

    // Development convenience data (same password as the admin).
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO companies (name, floor) VALUES ('Demo Company', 2)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const companyId = rows[0].id;

    const demoUsers: [string, string, string][] = [
      ['Demo Manager', 'manager@demo.local', 'Manager'],
      ['Demo Employee', 'employee@demo.local', 'Employee'],
    ];
    for (const [name, email, role] of demoUsers) {
      await db.query(
        `INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ((lower(email))) DO NOTHING`,
        [companyId, name, email, hash, role],
      );
    }

    const demoRooms: [string, number, number, string[]][] = [
      ['Room A', 8, 1, ['Projector', 'Whiteboard']],
      ['Room B', 4, 1, ['Whiteboard']],
      ['Board Room', 16, 3, ['Projector', 'Video conferencing']],
    ];
    for (const [name, capacity, floor, equipment] of demoRooms) {
      await db.query(
        `INSERT INTO rooms (name, capacity, floor, equipment) VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [name, capacity, floor, equipment],
      );
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  seed()
    .then(() => logger.info('Seed complete'))
    .catch((err: unknown) => {
      logger.error({ err }, 'Seed failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

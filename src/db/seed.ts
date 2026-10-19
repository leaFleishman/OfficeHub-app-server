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
      ['Demo Employee 2', 'employee2@demo.local', 'Employee'],
      ['Demo Employee 3', 'employee3@demo.local', 'Employee'],
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

    await db.query(
      `WITH samples (email, subject, content) AS (
         VALUES
           ('employee@demo.local', 'Air conditioning issue', 'The air conditioning in the meeting area is not cooling properly.'),
           ('employee2@demo.local', 'Request for an extra monitor', 'Could an extra monitor be provided at my workstation?'),
           ('manager@demo.local', 'Kitchen supplies', 'The shared kitchen is running low on coffee and paper cups.')
       )
       INSERT INTO inquiries (user_id, subject, content)
       SELECT u.id, s.subject, s.content
       FROM samples s
       JOIN users u ON lower(u.email) = lower(s.email)
       WHERE NOT EXISTS (
         SELECT 1 FROM inquiries i
         WHERE i.user_id = u.id AND i.subject = s.subject
       )`,
    );

    await db.query(
      `WITH samples (email, room_name, subject, start_offset) AS (
         VALUES
           ('employee@demo.local', 'Room A', 'Demo project planning', interval '10 hours'),
           ('employee2@demo.local', 'Room B', 'Demo team meeting', interval '11 hours'),
           ('manager@demo.local', 'Board Room', 'Demo monthly review', interval '12 hours')
       ),
       slots AS (
         SELECT u.id AS user_id, r.id AS room_id, s.subject,
                date_trunc('day', now()) + interval '1 day' + s.start_offset AS start_time
         FROM samples s
         JOIN users u ON lower(u.email) = lower(s.email)
         JOIN rooms r ON r.name = s.room_name
       )
       INSERT INTO bookings (room_id, user_id, subject, start_time, end_time)
       SELECT s.room_id, s.user_id, s.subject, s.start_time, s.start_time + interval '1 hour'
       FROM slots s
       WHERE NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.user_id = s.user_id AND b.subject = s.subject AND b.start_time > now()
       )
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.room_id = s.room_id
           AND b.status = 'Active'
           AND tstzrange(b.start_time, b.end_time) &&
               tstzrange(s.start_time, s.start_time + interval '1 hour')
       )`,
    );
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

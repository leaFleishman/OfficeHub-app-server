import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { Booking, Page, PageParams } from '../types/domain.js';
import { Where, runPaginated } from '../utils/sql.js';

const COLUMNS = `b.id, b.room_id AS "roomId", r.name AS "roomName", b.user_id AS "userId",
  u.name AS "userName", b.subject, b.start_time AS "start", b.end_time AS "end",
  b.status, b.created_at AS "createdAt"`;
const FROM = `bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.user_id`;

export type NewBooking = { roomId: number; userId: number; subject: string; start: Date; end: Date };

export type BookingFilter = PageParams & {
  userId?: number;
  companyId?: number;
  roomId?: number;
  from?: Date;
  to?: Date;
  date?: string; // YYYY-MM-DD, interpreted in `timezone`
  timezone?: string;
  upcomingOnly?: boolean;
};

export async function findById(id: number, db: Db = pool): Promise<Booking | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE b.id = $1`, [id]);
  return (rows[0] as Booking | undefined) ?? null;
}

// Relies on the bookings_no_overlap exclusion constraint: an overlapping insert
// fails with SQLSTATE 23P01, which the service turns into a 409.
export async function insert({ roomId, userId, subject, start, end }: NewBooking, db: Db = pool): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO bookings (room_id, user_id, subject, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [roomId, userId, subject, start, end],
  );
  return (rows[0] as { id: number }).id;
}

// Atomic: only one concurrent caller can flip Active -> Cancelled.
export async function cancel(id: number, db: Db = pool): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE bookings SET status = 'Cancelled', cancelled_at = now()
     WHERE id = $1 AND status = 'Active'`,
    [id],
  );
  return rowCount === 1;
}

export async function countFutureActiveForRoom(roomId: number, db: Db = pool): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM bookings
     WHERE room_id = $1 AND status = 'Active' AND end_time > now()`,
    [roomId],
  );
  return (rows[0] as { n: number }).n;
}

export async function findNextForUser(userId: number, db: Db = pool): Promise<Booking | null> {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM ${FROM}
     WHERE b.user_id = $1 AND b.status = 'Active' AND b.end_time > now()
     ORDER BY b.start_time, b.id LIMIT 1`,
    [userId],
  );
  return (rows[0] as Booking | undefined) ?? null;
}

// `from`/`to` and `date` use overlap semantics (a booking that spans the
// boundary is included). `date` is a calendar day in `timezone`.
export function list(filter: BookingFilter, db: Db = pool): Promise<Page<Booking>> {
  const { userId, companyId, roomId, from, to, date, timezone, upcomingOnly, page, pageSize } = filter;
  const where = new Where().add(`b.status = 'Active'`);
  if (userId) where.add('b.user_id = ?', userId);
  if (companyId) where.add('u.company_id = ?', companyId);
  if (roomId) where.add('b.room_id = ?', roomId);
  if (from) where.add('b.end_time > ?', from);
  if (to) where.add('b.start_time < ?', to);
  if (upcomingOnly) where.add('b.end_time > now()');
  if (date) {
    where.add(
      `b.start_time < ((?::date + 1)::timestamp AT TIME ZONE ?::text)
       AND b.end_time > (?::date::timestamp AT TIME ZONE ?::text)`,
      date,
      timezone,
      date,
      timezone,
    );
  }
  const orderBy = upcomingOnly || date ? 'b.start_time, b.id' : 'b.start_time DESC, b.id DESC';
  return runPaginated<Booking>(db, { columns: COLUMNS, from: FROM, where, orderBy, page, pageSize });
}

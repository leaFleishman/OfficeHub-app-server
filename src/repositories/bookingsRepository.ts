import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import { env } from '../config/env.js';
import type { Booking, BookingParticipant, Page, PageParams } from '../types/domain.js';
import { Where, runPaginated } from '../utils/sql.js';
import type { CreateBookingBody } from '../validators/bookings.js';

const COLUMNS = `b.id, b.room_id AS "roomId", r.name AS "roomName", b.user_id AS "userId",
  u.name AS "userName", b.subject, b.start_time AS "start", b.end_time AS "end",
  b.status, b.created_at AS "createdAt",
  COALESCE((
    SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name, p.id)
    FROM booking_participants bp JOIN users p ON p.id = bp.user_id
    WHERE bp.booking_id = b.id
  ), '[]'::json) AS participants`;
const FROM = `bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.user_id`;

type BookingRecord = Omit<Booking, 'date' | 'startTime' | 'endTime'> & {
  start: Date;
  end: Date;
  participants: BookingParticipant[];
};

const localDateTimeFormatter = new Intl.DateTimeFormat('en', {
  timeZone: env.APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function toBooking(record: BookingRecord): Booking {
  const formatParts = (date: Date): Map<string, string> =>
    new Map(localDateTimeFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  const start = formatParts(record.start);
  const end = formatParts(record.end);
  const part = (parts: Map<string, string>, type: string): string => {
    const value = parts.get(type);
    if (!value) throw new Error(`Missing ${type} in formatted booking date/time`);
    return value;
  };

  return {
    id: record.id,
    roomId: record.roomId,
    roomName: record.roomName,
    userId: record.userId,
    userName: record.userName,
    subject: record.subject,
    date: `${part(start, 'year')}-${part(start, 'month')}-${part(start, 'day')}`,
    startTime: `${part(start, 'hour')}:${part(start, 'minute')}`,
    endTime: `${part(end, 'hour')}:${part(end, 'minute')}`,
    status: record.status,
    createdAt: record.createdAt,
    participants: record.participants,
  };
}

export type NewBooking = CreateBookingBody;
export type LocalBookingTimes = { start: Date; end: Date; startValid: boolean; endValid: boolean };

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

export async function findById(id: number, db: Db = pool): Promise<BookingRecord | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE b.id = $1`, [id]);
  return (rows[0] as BookingRecord | undefined) ?? null;
}

export { toBooking };

export async function findEligibleParticipantIds(
  ids: number[],
  companyId: number,
  db: Db,
): Promise<number[]> {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT id FROM users
     WHERE id = ANY($1::int[]) AND company_id = $2 AND role <> 'Admin' AND is_blocked = false
     FOR SHARE`,
    [ids, companyId],
  );
  return (rows as { id: number }[]).map(({ id }) => id);
}

export async function resolveLocalTimes(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
  db: Db = pool,
): Promise<LocalBookingTimes> {
  const { rows } = await db.query<{
    start: Date;
    end: Date;
    startLocal: string;
    endLocal: string;
  }>(
    `SELECT
       (($1::date + $2::time) AT TIME ZONE $4::text) AS start,
       (($1::date + $3::time) AT TIME ZONE $4::text) AS end,
       to_char((($1::date + $2::time) AT TIME ZONE $4::text) AT TIME ZONE $4::text, 'YYYY-MM-DD HH24:MI') AS "startLocal",
       to_char((($1::date + $3::time) AT TIME ZONE $4::text) AT TIME ZONE $4::text, 'YYYY-MM-DD HH24:MI') AS "endLocal"`,
    [date, startTime, endTime, timezone],
  );
  const row = rows[0];
  return {
    start: row.start,
    end: row.end,
    startValid: row.startLocal === `${date} ${startTime}`,
    endValid: row.endLocal === `${date} ${endTime}`,
  };
}

// Relies on the bookings_no_overlap exclusion constraint: an overlapping insert
// fails with SQLSTATE 23P01, which the service turns into a 409.
export async function insert(
  booking: NewBooking,
  userId: number,
  { start, end }: Pick<LocalBookingTimes, 'start' | 'end'>,
  db: Db = pool,
): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO bookings (room_id, user_id, subject, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [booking.roomId, userId, booking.subject, start, end],
  );
  const id = (rows[0] as { id: number }).id;
  const attendeeIds = [...new Set([userId, ...booking.participantIds])];
  await db.query(
    `INSERT INTO booking_participants (booking_id, user_id)
     SELECT $1, attendees.user_id FROM unnest($2::int[]) AS attendees(user_id)`,
    [id, attendeeIds],
  );
  return id;
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
     WHERE (b.user_id = $1 OR EXISTS (
       SELECT 1 FROM booking_participants bp
       WHERE bp.booking_id = b.id AND bp.user_id = $1
     )) AND b.status = 'Active' AND b.end_time > now()
     ORDER BY b.start_time, b.id LIMIT 1`,
    [userId],
  );
  const record = (rows[0] as BookingRecord | undefined) ?? null;
  return record ? toBooking(record) : null;
}

// `from`/`to` and `date` use overlap semantics (a booking that spans the
// boundary is included). `date` is a calendar day in `timezone`.
export async function list(filter: BookingFilter, db: Db = pool): Promise<Page<Booking>> {
  const { userId, companyId, roomId, from, to, date, timezone, upcomingOnly, page, pageSize } = filter;
  const where = new Where().add(`b.status = 'Active'`);
  if (userId) {
    where.add(
      `(b.user_id = ? OR EXISTS (
         SELECT 1 FROM booking_participants bp
         WHERE bp.booking_id = b.id AND bp.user_id = ?
       ))`,
      userId,
      userId,
    );
  }
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
  const result = await runPaginated<BookingRecord>(db, { columns: COLUMNS, from: FROM, where, orderBy, page, pageSize });
  return { ...result, items: result.items.map(toBooking) };
}

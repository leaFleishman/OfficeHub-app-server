import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { Page, PageParams, Room } from '../types/domain.js';
import { Where, buildUpdate, likePattern, runPaginated } from '../utils/sql.js';

const COLUMNS = `id, name, capacity, floor, equipment, created_at AS "createdAt"`;
const UPDATABLE = { name: 'name', capacity: 'capacity', floor: 'floor', equipment: 'equipment' };

export type RoomListFilter = PageParams & { search?: string };
export type AvailableRoomsFilter = PageParams & { start: Date; end: Date; minCapacity?: number };
export type NewRoom = { name: string; capacity: number; floor?: number; equipment?: string[] };
export type RoomPatch = Partial<NewRoom>;

export async function findById(id: number, db: Db = pool): Promise<Room | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM rooms WHERE id = $1`, [id]);
  return (rows[0] as Room | undefined) ?? null;
}

// Concurrency: a booking takes a KEY SHARE lock on the room row. It does not
// block other bookings, but it blocks a concurrent DELETE (which takes FOR UPDATE).
export async function lockForBooking(id: number, db: Db): Promise<boolean> {
  const { rowCount } = await db.query('SELECT id FROM rooms WHERE id = $1 FOR KEY SHARE', [id]);
  return rowCount === 1;
}

export async function lockForDelete(id: number, db: Db): Promise<Room | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM rooms WHERE id = $1 FOR UPDATE`, [id]);
  return (rows[0] as Room | undefined) ?? null;
}

export function list({ search, page, pageSize }: RoomListFilter, db: Db = pool): Promise<Page<Room>> {
  const where = new Where();
  if (search) where.add('name ILIKE ?', likePattern(search));
  return runPaginated<Room>(db, { columns: COLUMNS, from: 'rooms', where, orderBy: 'floor, name, id', page, pageSize });
}

// Rooms with no active booking overlapping [start, end).
export function listAvailable(
  { start, end, minCapacity, page, pageSize }: AvailableRoomsFilter,
  db: Db = pool,
): Promise<Page<Room>> {
  const where = new Where().add(
    `NOT EXISTS (
       SELECT 1 FROM bookings b
       WHERE b.room_id = rooms.id AND b.status = 'Active'
         AND tstzrange(b.start_time, b.end_time) && tstzrange(?::timestamptz, ?::timestamptz))`,
    start,
    end,
  );
  if (minCapacity) where.add('capacity >= ?', minCapacity);
  return runPaginated<Room>(db, { columns: COLUMNS, from: 'rooms', where, orderBy: 'floor, name, id', page, pageSize });
}

export async function create(room: NewRoom, db: Db = pool): Promise<Room> {
  const { rows } = await db.query(
    `INSERT INTO rooms (name, capacity, floor, equipment) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [room.name, room.capacity, room.floor ?? 0, room.equipment ?? []],
  );
  return rows[0] as Room;
}

export async function update(id: number, patch: RoomPatch, db: Db = pool): Promise<Room | null> {
  const { sets, params } = buildUpdate(patch, UPDATABLE, 2);
  if (!sets.length) return findById(id, db);
  const { rows } = await db.query(
    `UPDATE rooms SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...params],
  );
  return (rows[0] as Room | undefined) ?? null;
}

export async function remove(id: number, db: Db = pool): Promise<void> {
  await db.query('DELETE FROM rooms WHERE id = $1', [id]);
}

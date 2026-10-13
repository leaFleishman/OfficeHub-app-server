import { logger } from '../config/logger.js';
import { withTransaction } from '../db/pool.js';
import * as bookingsRepo from '../repositories/bookingsRepository.js';
import * as roomsRepo from '../repositories/roomsRepository.js';
import type { Page, Room } from '../types/domain.js';
import { conflict, notFound } from '../utils/errors.js';
import { PG, isPgError } from '../utils/pgErrors.js';
import type { AvailableRoomsQuery, CreateRoomBody, ListRoomsQuery, UpdateRoomBody } from '../validators/rooms.js';

const log = logger.child({ module: 'rooms' });

const rethrowDuplicateName = (err: unknown): never => {
  if (isPgError(err, PG.UNIQUE)) throw conflict('A room with this name already exists', { name: 'Already in use' });
  throw err;
};

export const list = (query: ListRoomsQuery): Promise<Page<Room>> => roomsRepo.list(query);
export const listAvailable = (query: AvailableRoomsQuery): Promise<Page<Room>> => roomsRepo.listAvailable(query);

export async function get(id: number): Promise<Room> {
  const room = await roomsRepo.findById(id);
  if (!room) throw notFound('Room not found');
  return room;
}

export async function create(body: CreateRoomBody): Promise<Room> {
  try {
    const room = await roomsRepo.create(body);
    log.info({ roomId: room.id }, 'Room created');
    return room;
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}

export async function update(id: number, patch: UpdateRoomBody): Promise<Room> {
  try {
    const room = await roomsRepo.update(id, patch);
    if (!room) throw notFound('Room not found');
    return room;
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}

// Resource contention: the room row is locked FOR UPDATE, which waits for any
// in-flight booking (they hold KEY SHARE) and blocks new ones until we finish.
// The "no future bookings" check therefore cannot be invalidated mid-delete.
export async function remove(id: number): Promise<void> {
  await withTransaction(async (tx) => {
    const room = await roomsRepo.lockForDelete(id, tx);
    if (!room) throw notFound('Room not found');

    const upcoming = await bookingsRepo.countFutureActiveForRoom(id, tx);
    if (upcoming > 0) {
      throw conflict(`Room has ${upcoming} upcoming booking(s); cancel them before deleting the room`);
    }
    await roomsRepo.remove(id, tx);
  });
  log.info({ roomId: id }, 'Room deleted');
}

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { MAX_BOOKING_HOURS, ROLES } from '../constants.js';
import { withTransaction } from '../db/pool.js';
import * as bookingsRepo from '../repositories/bookingsRepository.js';
import * as roomsRepo from '../repositories/roomsRepository.js';
import type { Booking, Page, User } from '../types/domain.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { PG, isPgError } from '../utils/pgErrors.js';
import type { CreateBookingBody, ListBookingsQuery, MyBookingsQuery } from '../validators/bookings.js';
import type { RoomBookingsQuery } from '../validators/rooms.js';

const log = logger.child({ module: 'bookings' });
const HOUR_MS = 3_600_000;

export const listMine = (userId: number, query: MyBookingsQuery): Promise<Page<Booking>> =>
  bookingsRepo.list({ ...query, userId, upcomingOnly: query.upcoming });

// Managers only ever see their own company; admins see the whole building.
export function listVisible(actor: User, query: ListBookingsQuery): Promise<Page<Booking>> {
  const companyId = actor.role === ROLES.ADMIN ? query.companyId : (actor.companyId ?? undefined);
  return bookingsRepo.list({ ...query, userId: query.employeeId, companyId });
}

// Calendar view of one room: occupancy is public, details are private.
export async function listForRoom(
  actor: User,
  roomId: number,
  { date, page, pageSize }: RoomBookingsQuery,
): Promise<Page<Booking>> {
  if (!(await roomsRepo.findById(roomId))) throw notFound('Room not found');
  const result = await bookingsRepo.list({ roomId, date, timezone: env.APP_TIMEZONE, page, pageSize });
  const items = result.items.map((b) =>
    b.userId === actor.id || actor.role === ROLES.ADMIN ? b : { ...b, subject: null, userName: null },
  );
  return { ...result, items };
}

export async function create(actor: User, { roomId, subject, start, end }: CreateBookingBody): Promise<Booking> {
  if (start.getTime() <= Date.now()) {
    throw badRequest('A booking must start in the future', { start: 'Must be in the future' });
  }
  if (end.getTime() - start.getTime() > MAX_BOOKING_HOURS * HOUR_MS) {
    throw badRequest(`A booking cannot exceed ${MAX_BOOKING_HOURS} hours`, { end: 'Too long' });
  }

  try {
    const booking = await withTransaction(async (tx) => {
      // Blocks a concurrent room deletion; does not block other bookings.
      if (!(await roomsRepo.lockForBooking(roomId, tx))) throw notFound('Room not found');
      // The exclusion constraint is the single source of truth for overlaps:
      // of two simultaneous requests for the same slot, exactly one succeeds.
      const id = await bookingsRepo.insert({ roomId, userId: actor.id, subject, start, end }, tx);
      const created = await bookingsRepo.findById(id, tx);
      if (!created) throw new Error('Booking vanished inside its own transaction');
      return created;
    });
    log.info({ bookingId: booking.id, roomId, start, end }, 'Booking created');
    return booking;
  } catch (err) {
    if (isPgError(err, PG.EXCLUSION, 'bookings_no_overlap')) {
      log.info({ roomId, start, end }, 'Booking rejected: slot already taken');
      throw conflict('The room is already booked for the requested time');
    }
    throw err;
  }
}

export async function cancel(actor: User, id: number): Promise<void> {
  const booking = await bookingsRepo.findById(id);
  if (!booking) throw notFound('Booking not found');
  if (booking.userId !== actor.id && actor.role !== ROLES.ADMIN) {
    throw forbidden('You can only cancel your own bookings');
  }
  if (booking.status !== 'Active') return; // already cancelled: idempotent
  if (booking.end.getTime() <= Date.now()) throw conflict('A booking that has already ended cannot be cancelled');

  // Atomic flip; if a concurrent request won the race the outcome is the same.
  if (await bookingsRepo.cancel(id)) log.info({ bookingId: id, cancelledBy: actor.id }, 'Booking cancelled');
}

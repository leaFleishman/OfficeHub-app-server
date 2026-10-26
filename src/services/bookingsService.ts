import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { MAX_BOOKING_HOURS, ROLES } from '../constants.js';
import { withTransaction } from '../db/pool.js';
import * as bookingsRepo from '../repositories/bookingsRepository.js';
import * as roomsRepo from '../repositories/roomsRepository.js';
import type { Booking, Page, User } from '../types/domain.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { PG, isPgError } from '../utils/pgErrors.js';
import type {
  CompanyBookingsQuery,
  CreateBookingBody,
  ListAllBookingsQuery,
  ListBookingsQuery,
  MyBookingsQuery,
} from '../validators/bookings.js';
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

export function listAllForAdmin(actor: User, query: ListAllBookingsQuery): Promise<Page<Booking>> {
  if (actor.role !== ROLES.ADMIN) throw forbidden();
  return bookingsRepo.list({
    page: query.page,
    pageSize: query.pageSize,
  });
}

export function listForCompany(actor: User, query: CompanyBookingsQuery): Promise<Page<Booking>> {
  let companyId: number;
  if (actor.role === ROLES.ADMIN) {
    if (!query.companyId) throw badRequest('companyId is required', { companyId: 'Required' });
    companyId = query.companyId;
  } else {
    if (actor.companyId === null) throw forbidden('This account is not linked to a company');
    if (query.companyId !== undefined && query.companyId !== actor.companyId) throw forbidden();
    companyId = actor.companyId;
  }

  return bookingsRepo.list({ companyId, includeCancelled: true, page: query.page, pageSize: query.pageSize });
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
    b.userId === actor.id || b.participants.some(({ id }) => id === actor.id) || actor.role === ROLES.ADMIN
      ? b
      : { ...b, subject: null, userName: null, participants: [] },
  );
  return { ...result, items };
}

export async function create(
  actor: User,
  { roomId, subject, date, startTime, endTime, participantIds: requestedParticipantIds }: CreateBookingBody,
): Promise<Booking> {
  const localTimes = await bookingsRepo.resolveLocalTimes(date, startTime, endTime, env.APP_TIMEZONE);
  if (!localTimes.startValid || !localTimes.endValid) {
    const details: Record<string, string> = {};
    if (!localTimes.startValid) details.startTime = 'This local time does not exist in the application timezone';
    if (!localTimes.endValid) details.endTime = 'This local time does not exist in the application timezone';
    throw badRequest('The selected date and time are invalid in the application timezone', details);
  }
  const { start, end } = localTimes;
  if (end <= start) {
    throw badRequest('endTime must be after startTime', { endTime: 'Must be after startTime' });
  }
  if (start.getTime() <= Date.now()) {
    throw badRequest('A booking must start in the future', { date: 'Must be in the future' });
  }
  if (end.getTime() - start.getTime() > MAX_BOOKING_HOURS * HOUR_MS) {
    throw badRequest(`A booking cannot exceed ${MAX_BOOKING_HOURS} hours`, { endTime: 'Too long' });
  }

  const participantIds = [...new Set(requestedParticipantIds)].filter((id) => id !== actor.id);
  const bookingInput: CreateBookingBody = {
    roomId,
    subject,
    date,
    startTime,
    endTime,
    participantIds,
  };

  try {
    const booking = await withTransaction(async (tx) => {
      const capacity = await roomsRepo.lockForBooking(roomId, tx);
      if (capacity === null) throw notFound('Room not found');
      if (participantIds.length + 1 > capacity) {
        throw badRequest('The number of attendees exceeds the room capacity', {
          participantIds: 'Exceeds room capacity',
        });
      }
      if (participantIds.length) {
        if (actor.companyId === null && actor.role !== ROLES.ADMIN) {
          throw badRequest("Participants must belong to the organizer's company", {
            participantIds: 'Invalid participants',
          });
        }
        const eligibleIds = await bookingsRepo.findEligibleParticipantIds(participantIds, actor.companyId, tx);
        if (eligibleIds.length !== participantIds.length) {
          throw badRequest('One or more participants are invalid, inactive, or outside your company', {
            participantIds: 'Invalid participants',
          });
        }
      }
      // The exclusion constraint is the single source of truth for overlaps:
      // of two simultaneous requests for the same slot, exactly one succeeds.
      const id = await bookingsRepo.insert(bookingInput, actor.id, { start, end }, tx);
      const created = await bookingsRepo.findById(id, tx);
      if (!created) throw new Error('Booking vanished inside its own transaction');
      return bookingsRepo.toBooking(created);
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

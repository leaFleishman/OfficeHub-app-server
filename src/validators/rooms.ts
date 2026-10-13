import { z } from 'zod';
import { atLeastOneField, calendarDate, dateTime, id, pagination, search } from './common.js';

const roomFields = z.object({
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(500),
  floor: z.number().int().min(-5).max(200).optional(),
  equipment: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export const createRoomBody = roomFields;
export const updateRoomBody = atLeastOneField(roomFields.partial());

export const listRoomsQuery = z.object({ ...pagination, search });

export const availableRoomsQuery = z
  .object({ start: dateTime, end: dateTime, minCapacity: id.optional(), ...pagination })
  .refine((q) => q.end > q.start, { message: 'end must be after start', path: ['end'] });

export const roomBookingsQuery = z.object({ date: calendarDate.optional(), ...pagination });

export type CreateRoomBody = z.infer<typeof createRoomBody>;
export type UpdateRoomBody = z.infer<typeof updateRoomBody>;
export type ListRoomsQuery = z.infer<typeof listRoomsQuery>;
export type AvailableRoomsQuery = z.infer<typeof availableRoomsQuery>;
export type RoomBookingsQuery = z.infer<typeof roomBookingsQuery>;

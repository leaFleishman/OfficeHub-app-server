import { z } from 'zod';
import { calendarDate, dateTime, id, pagination } from './common.js';

const participantId = z.number().int().positive().max(2_147_483_647);

export const createBookingBody = z.object({
  roomId: id,
  subject: z.string().trim().min(1).max(200),
  date: calendarDate,
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Must be a time in HH:mm format'),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Must be a time in HH:mm format'),
  participantIds: z
    .array(participantId)
    .max(500)
    .superRefine((ids, ctx) => {
      const seen = new Set<number>();
      ids.forEach((participantId, index) => {
        if (seen.has(participantId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Participant IDs must be unique', path: [index] });
        }
        seen.add(participantId);
      });
    })
    .default([]),
});

export const myBookingsQuery = z.object({
  upcoming: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ...pagination,
});

export const listBookingsQuery = z.object({
  employeeId: id.optional(),
  roomId: id.optional(),
  companyId: id.optional(),
  from: dateTime.optional(),
  to: dateTime.optional(),
  ...pagination,
});

export const listAllBookingsQuery = z.object({
  ...pagination,
});

export type CreateBookingBody = z.infer<typeof createBookingBody>;
export type MyBookingsQuery = z.infer<typeof myBookingsQuery>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;
export type ListAllBookingsQuery = z.infer<typeof listAllBookingsQuery>;

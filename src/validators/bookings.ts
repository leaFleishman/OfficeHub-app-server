import { z } from 'zod';
import { dateTime, id, pagination } from './common.js';

export const createBookingBody = z
  .object({
    roomId: id,
    subject: z.string().trim().min(1).max(200),
    start: dateTime,
    end: dateTime,
  })
  .refine((b) => b.end > b.start, { message: 'end must be after start', path: ['end'] });

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

export type CreateBookingBody = z.infer<typeof createBookingBody>;
export type MyBookingsQuery = z.infer<typeof myBookingsQuery>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;

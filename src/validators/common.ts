import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

const MAX_INT = 2_147_483_647;

export const id = z.coerce.number().int().positive().max(MAX_INT);
export const idParams = z.object({ id });

export const pagination = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const search = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => v || undefined);

// Requires an explicit offset ("Z" or "+03:00") so the instant is never ambiguous.
export const dateTime = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 date-time with a timezone, e.g. 2026-10-20T09:00:00Z' })
  .transform((s) => new Date(s));

export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Invalid calendar date');

export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(8, 'At least 8 characters').max(72, 'At most 72 characters');
export const phone = z.string().trim().max(30);

// Rejects an empty PUT/PATCH body ("{}" would otherwise be a no-op update).
export const atLeastOneField = <T extends z.AnyZodObject>(schema: T) =>
  schema.refine((o) => Object.values(o).some((v) => v !== undefined), 'At least one field is required');

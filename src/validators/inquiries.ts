import { z } from 'zod';
import { pagination, search } from './common.js';

const status = z.enum(['Open', 'InProgress', 'Closed']);

export const createInquiryBody = z.object({
  subject: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
});

export const myInquiriesQuery = z.object({ status: status.optional(), ...pagination });
export const listInquiriesQuery = z.object({ status: status.optional(), search, ...pagination });

export const handleInquiryBody = z.object({
  status: z.enum(['InProgress', 'Closed']),
  reply: z.string().trim().min(1).max(5000).optional(),
});

export type CreateInquiryBody = z.infer<typeof createInquiryBody>;
export type MyInquiriesQuery = z.infer<typeof myInquiriesQuery>;
export type ListInquiriesQuery = z.infer<typeof listInquiriesQuery>;
export type HandleInquiryBody = z.infer<typeof handleInquiryBody>;

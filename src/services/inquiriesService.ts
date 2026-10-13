import { logger } from '../config/logger.js';
import { ROLES } from '../constants.js';
import * as inquiriesRepo from '../repositories/inquiriesRepository.js';
import type { Inquiry, Page, User } from '../types/domain.js';
import { conflict, notFound } from '../utils/errors.js';
import type {
  CreateInquiryBody,
  HandleInquiryBody,
  ListInquiriesQuery,
  MyInquiriesQuery,
} from '../validators/inquiries.js';

const log = logger.child({ module: 'inquiries' });

async function getOrThrow(id: number): Promise<Inquiry> {
  const inquiry = await inquiriesRepo.findById(id);
  if (!inquiry) throw notFound('Inquiry not found');
  return inquiry;
}

export const listMine = (userId: number, query: MyInquiriesQuery): Promise<Page<Inquiry>> =>
  inquiriesRepo.list({ ...query, userId });

export const listAll = (query: ListInquiriesQuery): Promise<Page<Inquiry>> => inquiriesRepo.list(query);

export async function create(actor: User, { subject, content }: CreateInquiryBody): Promise<Inquiry> {
  const id = await inquiriesRepo.insert({ userId: actor.id, subject, content });
  log.info({ inquiryId: id }, 'Inquiry created');
  return getOrThrow(id);
}

export async function get(actor: User, id: number): Promise<Inquiry> {
  const inquiry = await getOrThrow(id);
  if (inquiry.userId !== actor.id && actor.role !== ROLES.ADMIN) throw notFound('Inquiry not found');
  return inquiry;
}

export async function handle(actor: User, id: number, { status, reply }: HandleInquiryBody): Promise<Inquiry> {
  await getOrThrow(id);

  // The UPDATE only matches non-closed rows, so two admins racing to close the
  // same inquiry cannot both succeed.
  const updated = await inquiriesRepo.handle(id, { status, reply, handledBy: actor.id });
  if (!updated) throw conflict('This inquiry is already closed');

  log.info({ inquiryId: id, status, handledBy: actor.id }, 'Inquiry handled');
  return getOrThrow(id);
}

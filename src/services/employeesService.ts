import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ROLES } from '../constants.js';
import * as companiesRepo from '../repositories/companiesRepository.js';
import * as usersRepo from '../repositories/usersRepository.js';
import type { Page, User } from '../types/domain.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { PG, isPgError } from '../utils/pgErrors.js';
import type {
  AssignableRole,
  CreateEmployeeBody,
  ListEmployeesQuery,
  UpdateEmployeeBody,
} from '../validators/employees.js';

const log = logger.child({ module: 'employees' });
const isAdmin = (actor: User): boolean => actor.role === ROLES.ADMIN;

// A manager can only act on staff of their own company. Anything else is
// reported as "not found" so other companies' data is never revealed.
async function loadManageable(actor: User, id: number): Promise<User> {
  const target = await usersRepo.findById(id);
  if (!target || target.role === ROLES.ADMIN) throw notFound('Employee not found');
  if (!isAdmin(actor) && target.companyId !== actor.companyId) throw notFound('Employee not found');
  return target;
}

const rethrowDuplicateEmail = (err: unknown): never => {
  if (isPgError(err, PG.UNIQUE, 'users_email_uq')) {
    throw conflict('Email is already in use', { email: 'Already in use' });
  }
  throw err;
};

export const list = (actor: User, { search, companyId, page, pageSize }: ListEmployeesQuery): Promise<Page<User>> =>
  usersRepo.list({ companyId: isAdmin(actor) ? companyId : (actor.companyId ?? undefined), search, page, pageSize });

export const get = (actor: User, id: number): Promise<User> => loadManageable(actor, id);

export async function create(actor: User, body: CreateEmployeeBody): Promise<User> {
  const companyId = isAdmin(actor) ? body.companyId : actor.companyId;
  if (!companyId) throw badRequest('companyId is required', { companyId: 'Required' });
  if (isAdmin(actor) && !(await companiesRepo.findById(companyId))) throw notFound('Company not found');

  try {
    const user = await usersRepo.create({
      companyId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      role: body.role,
      passwordHash: await bcrypt.hash(body.password, env.BCRYPT_ROUNDS),
    });
    log.info({ employeeId: user.id, companyId, role: user.role, createdBy: actor.id }, 'Employee created');
    return user;
  } catch (err) {
    return rethrowDuplicateEmail(err);
  }
}

export async function update(actor: User, id: number, patch: UpdateEmployeeBody): Promise<User> {
  await loadManageable(actor, id);
  try {
    const user = await usersRepo.update(id, patch);
    if (!user) throw notFound('Employee not found');
    return user;
  } catch (err) {
    return rethrowDuplicateEmail(err);
  }
}

export async function setBlocked(actor: User, id: number, isBlocked: boolean): Promise<User> {
  if (id === actor.id) throw badRequest('You cannot block or unblock yourself');
  await loadManageable(actor, id);
  const user = await usersRepo.setBlocked(id, isBlocked); // idempotent single statement
  if (!user) throw notFound('Employee not found');
  log.info({ employeeId: id, isBlocked, changedBy: actor.id }, isBlocked ? 'Employee blocked' : 'Employee unblocked');
  return user;
}

export async function setRole(actor: User, id: number, role: AssignableRole): Promise<User> {
  if (id === actor.id) throw badRequest('You cannot change your own role');
  await loadManageable(actor, id);
  const user = await usersRepo.setRole(id, role);
  if (!user) throw notFound('Employee not found');
  log.info({ employeeId: id, role, changedBy: actor.id }, 'Employee role changed');
  return user;
}

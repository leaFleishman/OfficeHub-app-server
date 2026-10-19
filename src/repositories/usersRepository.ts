import type { Role } from '../constants.js';
import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { Page, PageParams, User, UserWithPassword } from '../types/domain.js';
import { Where, buildUpdate, likePattern, runPaginated } from '../utils/sql.js';

const COLUMNS = `id, company_id AS "companyId", name, email, phone, address, role,
  is_blocked AS "isBlocked", created_at AS "createdAt"`;
const UPDATABLE = { name: 'name', email: 'email', phone: 'phone', address: 'address' };

export type UserListFilter = PageParams & { companyId?: number; search?: string };
export type NewUser = {
  companyId: number;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: Role;
};
export type UserPatch = { name?: string; email?: string; phone?: string | null; address?: string | null };

export async function findById(id: number, db: Db = pool): Promise<User | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return (rows[0] as User | undefined) ?? null;
}

export async function findAuthByEmail(email: string, db: Db = pool): Promise<UserWithPassword | null> {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, password_hash AS "passwordHash" FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return (rows[0] as UserWithPassword | undefined) ?? null;
}

export async function findPasswordHash(id: number, db: Db = pool): Promise<string | null> {
  const { rows } = await db.query('SELECT password_hash AS "passwordHash" FROM users WHERE id = $1', [id]);
  return (rows[0] as { passwordHash: string } | undefined)?.passwordHash ?? null;
}

// Lists company staff (admins are never part of an employee list).
export function list({ companyId, search, page, pageSize }: UserListFilter, db: Db = pool): Promise<Page<User>> {
  const where = new Where().add(`role <> 'Admin'`);
  if (companyId) where.add('company_id = ?', companyId);
  if (search) where.add('(name ILIKE ? OR email ILIKE ?)', likePattern(search), likePattern(search));
  return runPaginated<User>(db, { columns: COLUMNS, from: 'users', where, orderBy: 'name, id', page, pageSize });
}

export async function create(user: NewUser, db: Db = pool): Promise<User> {
  const { rows } = await db.query(
    `INSERT INTO users (company_id, name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
    [user.companyId, user.name, user.email, user.phone ?? null, user.passwordHash, user.role],
  );
  return rows[0] as User;
}

export async function update(id: number, patch: UserPatch, db: Db = pool): Promise<User | null> {
  const { sets, params } = buildUpdate(patch, UPDATABLE, 2);
  if (!sets.length) return findById(id, db);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...params],
  );
  return (rows[0] as User | undefined) ?? null;
}

export async function setBlocked(id: number, isBlocked: boolean, db: Db = pool): Promise<User | null> {
  const { rows } = await db.query(
    `UPDATE users SET is_blocked = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, isBlocked],
  );
  return (rows[0] as User | undefined) ?? null;
}

export async function setRole(id: number, role: Role, db: Db = pool): Promise<User | null> {
  const { rows } = await db.query(
    `UPDATE users SET role = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, role],
  );
  return (rows[0] as User | undefined) ?? null;
}

export async function setPasswordHash(id: number, passwordHash: string, db: Db = pool): Promise<void> {
  await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
}

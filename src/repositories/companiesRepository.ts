import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { Company, Page, PageParams } from '../types/domain.js';
import { Where, buildUpdate, likePattern, runPaginated } from '../utils/sql.js';

const COLUMNS = `id, name, floor, phone, created_at AS "createdAt"`;
const UPDATABLE = { name: 'name', floor: 'floor', phone: 'phone' };

export type CompanyListFilter = PageParams & { search?: string };
export type NewCompany = { name: string; floor?: number | null; phone?: string | null };
export type CompanyPatch = Partial<NewCompany>;

export async function findById(id: number, db: Db = pool): Promise<Company | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM companies WHERE id = $1`, [id]);
  return (rows[0] as Company | undefined) ?? null;
}

export function list({ search, page, pageSize }: CompanyListFilter, db: Db = pool): Promise<Page<Company>> {
  const where = new Where();
  if (search) where.add('name ILIKE ?', likePattern(search));
  return runPaginated<Company>(db, { columns: COLUMNS, from: 'companies', where, orderBy: 'name, id', page, pageSize });
}

export async function create(company: NewCompany, db: Db = pool): Promise<Company> {
  const { rows } = await db.query(
    `INSERT INTO companies (name, floor, phone) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [company.name, company.floor ?? null, company.phone ?? null],
  );
  return rows[0] as Company;
}

export async function update(id: number, patch: CompanyPatch, db: Db = pool): Promise<Company | null> {
  const { sets, params } = buildUpdate(patch, UPDATABLE, 2);
  if (!sets.length) return findById(id, db);
  const { rows } = await db.query(
    `UPDATE companies SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...params],
  );
  return (rows[0] as Company | undefined) ?? null;
}

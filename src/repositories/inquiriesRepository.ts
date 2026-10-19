import type { InquiryStatus } from '../constants.js';
import { pool } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { Inquiry, Page, PageParams } from '../types/domain.js';
import { Where, likePattern, runPaginated } from '../utils/sql.js';

const COLUMNS = `i.id, i.user_id AS "userId", u.name AS "userName", i.subject, i.content,
  i.status, i.reply, i.handled_by AS "handledBy", i.created_at AS "createdAt",
  i.updated_at AS "updatedAt"`;
const FROM = `inquiries i JOIN users u ON u.id = i.user_id`;

export type NewInquiry = { userId: number; subject: string; content: string };
export type InquiryFilter = PageParams & {
  userId?: number;
  status?: InquiryStatus | 'All';
  search?: string;
};
export type InquiryDecision = { status: InquiryStatus; reply?: string; handledBy: number };

export async function findById(id: number, db: Db = pool): Promise<Inquiry | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE i.id = $1`, [id]);
  return (rows[0] as Inquiry | undefined) ?? null;
}

export async function insert({ userId, subject, content }: NewInquiry, db: Db = pool): Promise<number> {
  const { rows } = await db.query(
    'INSERT INTO inquiries (user_id, subject, content) VALUES ($1, $2, $3) RETURNING id',
    [userId, subject, content],
  );
  return (rows[0] as { id: number }).id;
}

export function list({ userId, status, search, page, pageSize }: InquiryFilter, db: Db = pool): Promise<Page<Inquiry>> {
  const where = new Where();
  if (userId) where.add('i.user_id = ?', userId);
  if (status && status !== 'All') where.add('i.status = ?', status);
  if (search) where.add('i.subject ILIKE ?', likePattern(search));
  return runPaginated<Inquiry>(db, {
    columns: COLUMNS,
    from: FROM,
    where,
    orderBy: 'i.created_at DESC, i.id DESC',
    page,
    pageSize,
  });
}

// Atomic state transition: a closed inquiry can never be modified again, even
// if two admins act on it at the same moment (the loser gets `false`).
export async function handle(
  id: number,
  { status, reply, handledBy }: InquiryDecision,
  db: Db = pool,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE inquiries
     SET status = $2, reply = COALESCE($3::text, reply), handled_by = $4, updated_at = now()
     WHERE id = $1 AND status <> 'Closed'`,
    [id, status, reply ?? null, handledBy],
  );
  return rowCount === 1;
}

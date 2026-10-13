import type { Db } from '../db/pool.js';
import type { Page, PageParams } from '../types/domain.js';

// Small helpers that keep repositories free of string-concatenation noise.
// Only *values* are ever parameterised; identifiers always come from constants
// defined inside the repositories, never from user input.

export class Where {
  #clauses: string[] = [];
  #params: unknown[] = [];

  // Each `?` in the fragment is replaced by the next positional parameter.
  add(fragment: string, ...values: unknown[]): this {
    let i = 0;
    const sql = fragment.replace(/\?/g, () => {
      this.#params.push(values[i++]);
      return `$${this.#params.length}`;
    });
    this.#clauses.push(sql);
    return this;
  }

  build(): { sql: string; params: unknown[] } {
    return {
      sql: this.#clauses.length ? `WHERE ${this.#clauses.join(' AND ')}` : '',
      params: [...this.#params],
    };
  }
}

export const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

// Builds `col = $n` pairs for a partial update, from a whitelist of columns.
export function buildUpdate(
  patch: object,
  columns: Record<string, string>,
  startIndex = 1,
): { sets: string[]; params: unknown[] } {
  const values = patch as Record<string, unknown>;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (values[key] === undefined) continue;
    params.push(values[key]);
    sets.push(`${column} = $${startIndex + params.length - 1}`);
  }
  return { sets, params };
}

export type PaginatedQuery = PageParams & {
  columns: string;
  from: string;
  where: Where;
  orderBy: string;
};

// Offset pagination with a stable ORDER BY (always end with a unique column).
export async function runPaginated<T>(
  db: Db,
  { columns, from, where, orderBy, page, pageSize }: PaginatedQuery,
): Promise<Page<T>> {
  const { sql, params } = where.build();
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${columns} FROM ${from} ${sql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM ${from} ${sql}`, params),
  ]);
  return { items: rows.rows as T[], total: (count.rows[0] as { total: number }).total, page, pageSize };
}

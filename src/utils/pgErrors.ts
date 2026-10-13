export const PG = {
  UNIQUE: '23505',
  EXCLUSION: '23P01',
  FOREIGN_KEY: '23503',
  CHECK: '23514',
} as const;

type PgErrorShape = { code?: string; constraint?: string };

export function isPgError(err: unknown, code: string, constraint?: string): boolean {
  const e = err as PgErrorShape | null | undefined;
  return e?.code === code && (constraint === undefined || e.constraint === constraint);
}

import type { Request, RequestHandler, Response } from 'express';
import type { z, ZodTypeAny } from 'zod';
import type { User } from '../types/domain.js';
import { badRequest, unauthorized } from '../utils/errors.js';

type Schemas = { params?: ZodTypeAny; query?: ZodTypeAny; body?: ZodTypeAny };
type Out<S extends Schemas, K extends keyof Schemas> = S[K] extends ZodTypeAny ? z.output<S[K]> : undefined;

// The parsed (coerced, trimmed, defaulted) input, typed from the zod schemas.
export type Input<S extends Schemas> = {
  params: Out<S, 'params'>;
  query: Out<S, 'query'>;
  body: Out<S, 'body'>;
};

function parse<S extends Schemas>(schemas: S, req: Request): Input<S> {
  const parsed: Record<string, unknown> = {};
  const details: Record<string, string> = {};

  for (const part of ['params', 'query', 'body'] as const) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      parsed[part] = result.data;
      continue;
    }
    for (const issue of result.error.issues) details[issue.path.join('.') || part] = issue.message;
  }

  if (Object.keys(details).length) throw badRequest('Validation failed', details);
  return parsed as Input<S>;
}

export type PublicContext = { req: Request; res: Response };
export type AuthedContext = PublicContext & { user: User };

// Validates the request against the schemas, then calls the handler with fully
// typed input. For routes behind `authenticate`, so `ctx.user` always exists.
export function endpoint<S extends Schemas>(
  schemas: S,
  handler: (input: Input<S>, ctx: AuthedContext) => Promise<void> | void,
): RequestHandler {
  return async (req, res) => {
    if (!req.user) throw unauthorized();
    await handler(parse(schemas, req), { req, res, user: req.user });
  };
}

// Same, for routes that do not require a logged-in user (login).
export function publicEndpoint<S extends Schemas>(
  schemas: S,
  handler: (input: Input<S>, ctx: PublicContext) => Promise<void> | void,
): RequestHandler {
  return async (req, res) => {
    await handler(parse(schemas, req), { req, res });
  };
}

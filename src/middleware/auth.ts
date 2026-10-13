import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../constants.js';
import * as usersRepo from '../repositories/usersRepository.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { requestContext } from '../utils/requestContext.js';

// Verifies the JWT, then loads the user from the database on every request so
// that blocking a user or changing a role takes effect immediately.
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized('Missing or malformed Authorization header');

  let subject: string | undefined;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    subject = typeof payload === 'string' ? undefined : payload.sub;
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const userId = Number(subject);
  if (!Number.isInteger(userId)) throw unauthorized('Invalid token');

  const user = await usersRepo.findById(userId);
  if (!user) throw unauthorized('User no longer exists');
  if (user.isBlocked) throw forbidden('This account is blocked');

  req.user = user;
  const store = requestContext.getStore();
  if (store) store.userId = user.id;
  next();
}

export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };

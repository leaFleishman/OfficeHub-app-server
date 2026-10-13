import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as usersRepo from '../repositories/usersRepository.js';
import type { User } from '../types/domain.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import type { LoginBody } from '../validators/auth.js';

const log = logger.child({ module: 'auth' });

// Compared against when the email is unknown, so response time does not reveal
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

export type LoginResult = { token: string; user: User };

export async function login({ email, password }: LoginBody): Promise<LoginResult> {
  const record = await usersRepo.findAuthByEmail(email);
  const passwordOk = await bcrypt.compare(password, record?.passwordHash ?? DUMMY_HASH);

  if (!record || !passwordOk) {
    log.warn({ email }, 'Failed login attempt');
    throw unauthorized('Invalid email or password');
  }
  if (record.isBlocked) {
    log.warn({ userId: record.id }, 'Blocked user tried to log in');
    throw forbidden('This account is blocked');
  }

  const { passwordHash: _omit, ...user } = record;
  const token = jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
  log.info({ userId: user.id, role: user.role }, 'User logged in');
  return { token, user };
}

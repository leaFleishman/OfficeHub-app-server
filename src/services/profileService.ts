import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as usersRepo from '../repositories/usersRepository.js';
import type { User } from '../types/domain.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { PG, isPgError } from '../utils/pgErrors.js';
import type { ChangePasswordBody, UpdateProfileBody } from '../validators/auth.js';

const log = logger.child({ module: 'profile' });

export async function update(userId: number, patch: UpdateProfileBody): Promise<User> {
  try {
    const user = await usersRepo.update(userId, patch);
    if (!user) throw notFound('User not found');
    return user;
  } catch (err) {
    if (isPgError(err, PG.UNIQUE, 'users_email_uq')) {
      throw conflict('Email is already in use', { email: 'Already in use' });
    }
    throw err;
  }
}

export async function changePassword(
  userId: number,
  { currentPassword, newPassword }: ChangePasswordBody,
): Promise<void> {
  const currentHash = await usersRepo.findPasswordHash(userId);
  if (!currentHash || !(await bcrypt.compare(currentPassword, currentHash))) {
    throw badRequest('Current password is incorrect', { currentPassword: 'Incorrect' });
  }
  await usersRepo.setPasswordHash(userId, await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS));
  log.info({ userId }, 'Password changed');
}

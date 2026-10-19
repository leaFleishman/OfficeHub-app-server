import { z } from 'zod';
import { atLeastOneField, email, password, phone } from './common.js';

export const loginBody = z.object({ email, password: z.string().min(1).max(200) });

export const updateProfileBody = atLeastOneField(
  z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
    phone: phone.nullable().optional(),
    address: z.string().trim().min(1).max(250).nullable().optional(),
  }),
);

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export type LoginBody = z.infer<typeof loginBody>;
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

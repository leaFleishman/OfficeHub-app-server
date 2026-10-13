import { z } from 'zod';
import { atLeastOneField, email, id, pagination, password, phone, search } from './common.js';

const assignableRole = z.enum(['Employee', 'Manager']);

export const listEmployeesQuery = z.object({ ...pagination, search, companyId: id.optional() });

export const createEmployeeBody = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  phone: phone.optional(),
  password, // initial password, chosen by whoever creates the account
  role: assignableRole.default('Employee'),
  companyId: id.optional(), // required for Admin, ignored for Manager
});

export const updateEmployeeBody = atLeastOneField(
  z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
    phone: phone.nullable().optional(),
  }),
);

export const setRoleBody = z.object({ role: assignableRole });

export type AssignableRole = z.infer<typeof assignableRole>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuery>;
export type CreateEmployeeBody = z.infer<typeof createEmployeeBody>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBody>;

import { z } from 'zod';
import { atLeastOneField, email, pagination, phone, search } from './common.js';

const companyFields = z.object({
  name: z.string().trim().min(1).max(100),
  floor: z.number().int().min(-5).max(200).nullable().optional(),
  phone: phone.nullable().optional(),
});

const managerFields = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password: z.string().min(4, 'At least 4 characters').max(72, 'At most 72 characters'),
});

export const listCompaniesQuery = z.object({ ...pagination, search });
export const createCompanyBody = companyFields.extend({ manager: managerFields });
export const updateCompanyBody = atLeastOneField(companyFields.partial());

export type ListCompaniesQuery = z.infer<typeof listCompaniesQuery>;
export type CreateCompanyBody = z.infer<typeof createCompanyBody>;
export type UpdateCompanyBody = z.infer<typeof updateCompanyBody>;

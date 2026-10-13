import { z } from 'zod';
import { atLeastOneField, pagination, phone, search } from './common.js';

const companyFields = z.object({
  name: z.string().trim().min(1).max(100),
  floor: z.number().int().min(-5).max(200).nullable().optional(),
  phone: phone.nullable().optional(),
});

export const listCompaniesQuery = z.object({ ...pagination, search });
export const createCompanyBody = companyFields;
export const updateCompanyBody = atLeastOneField(companyFields.partial());

export type ListCompaniesQuery = z.infer<typeof listCompaniesQuery>;
export type CreateCompanyBody = z.infer<typeof createCompanyBody>;
export type UpdateCompanyBody = z.infer<typeof updateCompanyBody>;

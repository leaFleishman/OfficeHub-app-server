import { logger } from '../config/logger.js';
import * as companiesRepo from '../repositories/companiesRepository.js';
import type { Company, Page } from '../types/domain.js';
import { conflict, notFound } from '../utils/errors.js';
import { PG, isPgError } from '../utils/pgErrors.js';
import type { CreateCompanyBody, ListCompaniesQuery, UpdateCompanyBody } from '../validators/companies.js';

const log = logger.child({ module: 'companies' });

const rethrowDuplicateName = (err: unknown): never => {
  if (isPgError(err, PG.UNIQUE)) throw conflict('A company with this name already exists', { name: 'Already in use' });
  throw err;
};

export const list = (query: ListCompaniesQuery): Promise<Page<Company>> => companiesRepo.list(query);

export async function get(id: number): Promise<Company> {
  const company = await companiesRepo.findById(id);
  if (!company) throw notFound('Company not found');
  return company;
}

export async function create(body: CreateCompanyBody): Promise<Company> {
  try {
    const company = await companiesRepo.create(body);
    log.info({ companyId: company.id }, 'Company created');
    return company;
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}

export async function update(id: number, patch: UpdateCompanyBody): Promise<Company> {
  try {
    const company = await companiesRepo.update(id, patch);
    if (!company) throw notFound('Company not found');
    return company;
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}

export async function remove(id: number): Promise<void> {
  try {
    if (!(await companiesRepo.remove(id))) throw notFound('Company not found');
  } catch (err) {
    if (isPgError(err, PG.FOREIGN_KEY)) {
      throw conflict('Company cannot be deleted while employees are assigned to it');
    }
    throw err;
  }
  log.info({ companyId: id }, 'Company deleted');
}

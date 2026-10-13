import { env } from '../config/env.js';
import * as dashboardRepo from '../repositories/dashboardRepository.js';
import type { BuildingDashboard, CompanyDashboard, EmployeeDashboard } from '../repositories/dashboardRepository.js';
import type { User } from '../types/domain.js';
import { forbidden } from '../utils/errors.js';

export const forEmployee = (actor: User): Promise<EmployeeDashboard> =>
  dashboardRepo.employeeStats(actor.id, env.APP_TIMEZONE);

export function forCompany(actor: User): Promise<CompanyDashboard> {
  if (actor.companyId === null) throw forbidden('This account is not linked to a company');
  return dashboardRepo.companyStats(actor.companyId, env.APP_TIMEZONE);
}

export const forBuilding = (): Promise<BuildingDashboard> => dashboardRepo.buildingStats(env.APP_TIMEZONE);

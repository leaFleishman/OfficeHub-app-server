import { endpoint } from '../middleware/endpoint.js';
import * as dashboardService from '../services/dashboardService.js';

export const employee = endpoint({}, async (_input, { res, user }) => {
  res.json(await dashboardService.forEmployee(user));
});

export const company = endpoint({}, async (_input, { res, user }) => {
  res.json(await dashboardService.forCompany(user));
});

export const building = endpoint({}, async (_input, { res }) => {
  res.json(await dashboardService.forBuilding());
});

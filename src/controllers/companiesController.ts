import { endpoint } from '../middleware/endpoint.js';
import * as companiesService from '../services/companiesService.js';
import { createCompanyBody, listCompaniesQuery, updateCompanyBody } from '../validators/companies.js';
import { idParams } from '../validators/common.js';
import { forbidden } from '../utils/errors.js';

export const list = endpoint({ query: listCompaniesQuery }, async ({ query }, { res }) => {
  res.json(await companiesService.list(query));
});

export const mine = endpoint({}, async (_input, { res, user }) => {
  if (user.companyId === null) throw forbidden('This account is not linked to a company');
  res.json(await companiesService.get(user.companyId));
});

export const create = endpoint({ body: createCompanyBody }, async ({ body }, { res }) => {
  res.status(201).json(await companiesService.create(body));
});

export const update = endpoint({ params: idParams, body: updateCompanyBody }, async ({ params, body }, { res }) => {
  res.json(await companiesService.update(params.id, body));
});

import { endpoint } from '../middleware/endpoint.js';
import * as employeesService from '../services/employeesService.js';
import { idParams } from '../validators/common.js';
import {
  createEmployeeBody,
  listEmployeesQuery,
  setRoleBody,
  updateEmployeeBody,
} from '../validators/employees.js';

export const list = endpoint({ query: listEmployeesQuery }, async ({ query }, { res, user }) => {
  res.json(await employeesService.list(user, query));
});

export const get = endpoint({ params: idParams }, async ({ params }, { res, user }) => {
  res.json(await employeesService.get(user, params.id));
});

export const create = endpoint({ body: createEmployeeBody }, async ({ body }, { res, user }) => {
  res.status(201).json(await employeesService.create(user, body));
});

export const update = endpoint({ params: idParams, body: updateEmployeeBody }, async ({ params, body }, { res, user }) => {
  res.json(await employeesService.update(user, params.id, body));
});

export const block = endpoint({ params: idParams }, async ({ params }, { res, user }) => {
  res.json(await employeesService.setBlocked(user, params.id, true));
});

export const unblock = endpoint({ params: idParams }, async ({ params }, { res, user }) => {
  res.json(await employeesService.setBlocked(user, params.id, false));
});

export const setRole = endpoint({ params: idParams, body: setRoleBody }, async ({ params, body }, { res, user }) => {
  res.json(await employeesService.setRole(user, params.id, body.role));
});

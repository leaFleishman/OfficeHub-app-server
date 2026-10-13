import { endpoint } from '../middleware/endpoint.js';
import * as inquiriesService from '../services/inquiriesService.js';
import { idParams } from '../validators/common.js';
import {
  createInquiryBody,
  handleInquiryBody,
  listInquiriesQuery,
  myInquiriesQuery,
} from '../validators/inquiries.js';

export const listMine = endpoint({ query: myInquiriesQuery }, async ({ query }, { res, user }) => {
  res.json(await inquiriesService.listMine(user.id, query));
});

export const listAll = endpoint({ query: listInquiriesQuery }, async ({ query }, { res }) => {
  res.json(await inquiriesService.listAll(query));
});

export const get = endpoint({ params: idParams }, async ({ params }, { res, user }) => {
  res.json(await inquiriesService.get(user, params.id));
});

export const create = endpoint({ body: createInquiryBody }, async ({ body }, { res, user }) => {
  res.status(201).json(await inquiriesService.create(user, body));
});

export const handle = endpoint({ params: idParams, body: handleInquiryBody }, async ({ params, body }, { res, user }) => {
  res.json(await inquiriesService.handle(user, params.id, body));
});

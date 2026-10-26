import { endpoint } from '../middleware/endpoint.js';
import * as bookingsService from '../services/bookingsService.js';
import {
  companyBookingsQuery,
  createBookingBody,
  listAllBookingsQuery,
  listBookingsQuery,
  myBookingsQuery,
} from '../validators/bookings.js';
import { idParams } from '../validators/common.js';
import { roomBookingsQuery } from '../validators/rooms.js';

export const listMine = endpoint({ query: myBookingsQuery }, async ({ query }, { res, user }) => {
  res.json(await bookingsService.listMine(user.id, query));
});

export const list = endpoint({ query: listBookingsQuery }, async ({ query }, { res, user }) => {
  res.json(await bookingsService.listVisible(user, query));
});

export const listAllForAdmin = endpoint(
  { query: listAllBookingsQuery },
  async ({ query }, { res, user }) => {
    res.json(await bookingsService.listAllForAdmin(user, query));
  },
);

export const listForCompany = endpoint(
  { query: companyBookingsQuery },
  async ({ query }, { res, user }) => {
    res.json(await bookingsService.listForCompany(user, query));
  },
);

export const listForRoom = endpoint(
  { params: idParams, query: roomBookingsQuery },
  async ({ params, query }, { res, user }) => {
    res.json(await bookingsService.listForRoom(user, params.id, query));
  },
);

export const create = endpoint({ body: createBookingBody }, async ({ body }, { res, user }) => {
  res.status(201).json(await bookingsService.create(user, body));
});

export const cancel = endpoint({ params: idParams }, async ({ params }, { res, user }) => {
  await bookingsService.cancel(user, params.id);
  res.status(204).end();
});

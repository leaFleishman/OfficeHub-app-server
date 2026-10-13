import { endpoint } from '../middleware/endpoint.js';
import * as roomsService from '../services/roomsService.js';
import { idParams } from '../validators/common.js';
import { availableRoomsQuery, createRoomBody, listRoomsQuery, updateRoomBody } from '../validators/rooms.js';

export const list = endpoint({ query: listRoomsQuery }, async ({ query }, { res }) => {
  res.json(await roomsService.list(query));
});

export const listAvailable = endpoint({ query: availableRoomsQuery }, async ({ query }, { res }) => {
  res.json(await roomsService.listAvailable(query));
});

export const get = endpoint({ params: idParams }, async ({ params }, { res }) => {
  res.json(await roomsService.get(params.id));
});

export const create = endpoint({ body: createRoomBody }, async ({ body }, { res }) => {
  res.status(201).json(await roomsService.create(body));
});

export const update = endpoint({ params: idParams, body: updateRoomBody }, async ({ params, body }, { res }) => {
  res.json(await roomsService.update(params.id, body));
});

export const remove = endpoint({ params: idParams }, async ({ params }, { res }) => {
  await roomsService.remove(params.id);
  res.status(204).end();
});

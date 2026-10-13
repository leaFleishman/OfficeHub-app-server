import { endpoint } from '../middleware/endpoint.js';
import * as profileService from '../services/profileService.js';
import { changePasswordBody, updateProfileBody } from '../validators/auth.js';

export const get = endpoint({}, (_input, { res, user }) => {
  res.json(user);
});

export const update = endpoint({ body: updateProfileBody }, async ({ body }, { res, user }) => {
  res.json(await profileService.update(user.id, body));
});

export const changePassword = endpoint({ body: changePasswordBody }, async ({ body }, { res, user }) => {
  await profileService.changePassword(user.id, body);
  res.status(204).end();
});

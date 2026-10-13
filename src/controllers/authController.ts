import { endpoint, publicEndpoint } from '../middleware/endpoint.js';
import * as authService from '../services/authService.js';
import { loginBody } from '../validators/auth.js';

export const login = publicEndpoint({ body: loginBody }, async ({ body }, { res }) => {
  res.json(await authService.login(body));
});

export const me = endpoint({}, (_input, { res, user }) => {
  res.json(user);
});

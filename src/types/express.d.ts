import type { User } from './domain.js';

declare global {
  namespace Express {
    interface Request {
      // Set by the `authenticate` middleware on every protected route.
      user?: User;
    }
  }
}

export {};

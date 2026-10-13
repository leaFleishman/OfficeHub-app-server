import { pino, stdTimeFunctions } from 'pino';
import { env } from './env.js';
import { requestContext } from '../utils/requestContext.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'office-server' },
  timestamp: stdTimeFunctions.isoTime,
  mixin: () => requestContext.getStore() ?? {},
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[redacted]',
  },
});

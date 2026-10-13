import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { requestContext } from './utils/requestContext.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  // Every log line written while handling this request carries its requestId/userId.
  app.use((req, _res, next) => requestContext.run({ requestId: String(req.id) }, next));

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (err) {
      logger.error({ err }, 'Health check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/', (_req, res) => {
    res.json({ service: 'office-server', status: 'running', api: '/api', health: '/health' });
  });

  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

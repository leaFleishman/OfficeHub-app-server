import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './db/pool.js';

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server listening');
});

let shuttingDown = false;

// Stop accepting connections, let in-flight requests finish, then close the pool.
function shutdown(signal: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  server.close(() => {
    void pool
      .end()
      .catch((err: unknown) => logger.error({ err }, 'Error closing database pool'))
      .finally(() => process.exit(exitCode));
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});

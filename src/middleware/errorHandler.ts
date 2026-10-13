import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { AppError, badRequest, conflict } from '../utils/errors.js';
import { PG } from '../utils/pgErrors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.path}`));
};

type LowLevelError = { type?: string; code?: string };

// Translates known low-level failures into proper HTTP errors. Services handle
// the cases that deserve a friendly message; this is the safety net.
function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  const low = (err ?? {}) as LowLevelError;
  if (low.type === 'entity.parse.failed') return badRequest('Malformed JSON body');
  if (low.type === 'entity.too.large') return new AppError(413, 'Request body too large');
  switch (low.code) {
    case PG.UNIQUE:
      return conflict('A record with the same unique value already exists');
    case PG.EXCLUSION:
      return conflict('The request conflicts with an existing record');
    case PG.FOREIGN_KEY:
      return conflict('The record is referenced by, or refers to, another record');
    case PG.CHECK:
      return badRequest('A value violates a data rule');
    default:
      return null;
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = toAppError(err);
  const status = appError?.status ?? 500;

  if (appError && status < 500) logger.warn({ status, message: appError.message }, 'Request rejected');
  else logger.error({ err }, 'Unhandled error');

  res.status(status).json({
    message: appError && status < 500 ? appError.message : 'Internal server error',
    errors: appError?.details,
    requestId: req.id,
  });
};

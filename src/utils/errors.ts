export type ErrorDetails = Record<string, string>;

export class AppError extends Error {
  readonly status: number;
  readonly details?: ErrorDetails;

  constructor(status: number, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: ErrorDetails): AppError => new AppError(400, message, details);
export const unauthorized = (message = 'Authentication required'): AppError => new AppError(401, message);
export const forbidden = (message = 'You do not have permission to do this'): AppError => new AppError(403, message);
export const notFound = (message = 'Resource not found'): AppError => new AppError(404, message);
export const conflict = (message: string, details?: ErrorDetails): AppError => new AppError(409, message, details);

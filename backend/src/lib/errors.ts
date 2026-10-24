export type ErrorDetail = { field?: string; message: string; [key: string]: unknown };

/**
 * Application error with a stable machine code. Only `message` and `details`
 * are ever sent to clients, and only when `expose` is true.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetail[] | Record<string, unknown>;
  readonly expose: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ErrorDetail[] | Record<string, unknown>,
    expose = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export const badRequest = (code: string, message: string, details?: ErrorDetail[]) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHENTICATED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
export const notFound = (message = 'Resource not found', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);
export const validationError = (message = 'The submitted data is invalid', details?: ErrorDetail[]) =>
  new AppError(422, 'VALIDATION_ERROR', message, details);

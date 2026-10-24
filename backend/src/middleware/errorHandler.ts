import type { Express, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}

type BodyParserError = Error & { type?: string; status?: number };

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  const respond = (status: number, code: string, message: string, details?: unknown) => {
    res.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...(env.isProduction ? {} : { requestId: req.requestId }),
      },
    });
  };

  if (error instanceof AppError) {
    return respond(error.status, error.code, error.message, error.expose ? error.details : undefined);
  }

  if (error instanceof ZodError) {
    return respond(
      422,
      'VALIDATION_ERROR',
      'The submitted data is invalid',
      error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    );
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return respond(413, 'FILE_TOO_LARGE', 'The uploaded file exceeds the allowed size.');
    }
    return respond(400, 'UPLOAD_REJECTED', 'The upload could not be accepted.');
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return respond(409, 'DUPLICATE_RECORD', 'This record already exists.');
    if (error.code === 'P2003') {
      return respond(409, 'REFERENCE_CONFLICT', 'This record is referenced by other records and cannot be changed.');
    }
    if (error.code === 'P2025') return respond(404, 'NOT_FOUND', 'The requested record was not found.');
    logger.error('database error', { code: error.code, requestId: req.requestId });
    return respond(400, 'DATABASE_REQUEST_FAILED', 'The request could not be completed.');
  }

  const bodyError = error as BodyParserError;
  if (bodyError?.type === 'entity.too.large') {
    return respond(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  if (bodyError instanceof SyntaxError && bodyError?.type === 'entity.parse.failed') {
    return respond(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }

  // Unknown errors: log the real cause server-side, never leak it to clients.
  logger.error('unhandled error', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    name: error instanceof Error ? error.name : 'unknown',
    detail: env.isProduction ? undefined : error instanceof Error ? error.message : String(error),
  });

  return respond(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please contact your administrator.');
}

export function applyErrorHandlers(app: Express): void {
  app.use(notFoundHandler);
  app.use(errorHandler);
}

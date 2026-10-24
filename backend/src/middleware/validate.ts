import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { validationError, type ErrorDetail } from '../lib/errors';

function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(validationError('The submitted data is invalid', zodDetails(result.error)));
    req.body = result.data;
    return next();
  };
}

/** Validated query is stored on res.locals to avoid mutating Express' query object. */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(validationError('Invalid query parameters', zodDetails(result.error)));
    res.locals.query = result.data;
    return next();
  };
}

export function validateParams(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(validationError('Invalid path parameters', zodDetails(result.error)));
    req.params = result.data as typeof req.params;
    return next();
  };
}

export function query<T>(res: Response): T {
  return res.locals.query as T;
}

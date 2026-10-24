import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env';

const handler = (_req: Request, res: Response) => {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait and try again.',
    },
  });
};

const base = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  handler,
};

/** Coarse protection for the whole API surface. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: env.GLOBAL_RATE_LIMIT_MAX,
  skip: () => env.isTest,
});

/**
 * Login limiter keyed by client IP. Account lockout (per email) is enforced
 * separately in the auth service so both IP spraying and account targeting are
 * slowed down.
 */
export const loginLimiter = rateLimit({
  ...base,
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
});

/** Sensitive mutations (password reset, import) get a tighter bucket. */
export const sensitiveLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  skip: () => env.isTest,
});

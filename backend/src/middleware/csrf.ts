import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { sha256, safeEqual } from '../lib/crypto';
import { prisma } from '../lib/prisma';
import { CSRF_COOKIE, csrfCookieOptions } from './auth';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function issueToken(res: Response): string {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
}

/** Ensures a pre-session CSRF cookie exists so the login form can be protected. */
export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction): void {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing !== 'string' || existing.length < 20) issueToken(res);
  next();
}

export function getCsrfToken(req: Request, res: Response): void {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = typeof existing === 'string' && existing.length >= 20 ? existing : issueToken(res);
  res.json({ data: { csrfToken: token } });
}

/**
 * Double-submit CSRF: the readable cookie must match the request header, and
 * (when authenticated) the hash stored on the server-side session. SameSite=Lax
 * alone is not relied upon.
 */
export async function csrfProtection(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!MUTATING.has(req.method)) return next();

  const header = req.get('x-csrf-token');
  const cookie = req.cookies?.[CSRF_COOKIE];

  if (typeof header !== 'string' || typeof cookie !== 'string' || !header || !cookie) {
    return next(new AppError(403, 'CSRF_FAILED', 'Missing CSRF token. Reload the page and try again.'));
  }
  if (!safeEqual(header, cookie)) {
    return next(new AppError(403, 'CSRF_FAILED', 'Invalid CSRF token. Reload the page and try again.'));
  }

  if (req.authSessionId) {
    const session = await prisma.session.findUnique({
      where: { id: req.authSessionId },
      select: { csrfHash: true },
    });
    if (!session || !safeEqual(sha256(header), session.csrfHash)) {
      return next(new AppError(403, 'CSRF_FAILED', 'Invalid CSRF token. Reload the page and try again.'));
    }
  }

  return next();
}

/**
 * Rejects cross-origin state-changing requests even if a CSRF token leaks.
 * Requests without an Origin header (non-browser clients, same-origin GET
 * navigations) are allowed but still require the CSRF token.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  if (env.CORS_ORIGINS_LIST.includes(origin)) return next();
  return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.'));
}

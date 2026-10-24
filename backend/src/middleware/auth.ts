import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sha256 } from '../lib/crypto';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { can, isRole, type Permission } from '../lib/permissions';

export const SESSION_COOKIE = 'lf_session';
export const CSRF_COOKIE = 'lf_csrf';

const sessionTtlMs = env.SESSION_TTL_MINUTES * 60_000;
const absoluteTtlMs = env.SESSION_ABSOLUTE_TTL_MINUTES * 60_000;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.min(sessionTtlMs, absoluteTtlMs),
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.min(sessionTtlMs, absoluteTtlMs),
  };
}

type CreatedSession = { sessionId: string; token: string; csrfToken: string; expiresAt: Date };

export async function createSession(userId: string, req: Request): Promise<CreatedSession> {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + absoluteTtlMs);
  const expiresAt = new Date(Math.min(now + sessionTtlMs, absoluteExpiresAt.getTime()));

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfHash: sha256(csrfToken),
      expiresAt,
      absoluteExpiresAt,
      ip: req.ip ?? null,
      userAgent: (req.get('user-agent') ?? '').slice(0, 300),
    },
  });

  return { sessionId: session.id, token, csrfToken, expiresAt };
}

export function setSessionCookies(res: Response, session: CreatedSession): void {
  res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions());
  res.cookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions());
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  res.clearCookie(CSRF_COOKIE, { ...csrfCookieOptions(), maxAge: undefined });
}

/**
 * Resolves the session cookie (hashed lookup), enforces idle + absolute expiry
 * and slides the expiry window. Never trusts user ids from the client.
 */
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 20) return next();

    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });

    if (!session) return next();

    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return next();
    }
    if (!session.user.isActive) {
      await prisma.session.deleteMany({ where: { userId: session.userId } }).catch(() => undefined);
      return next();
    }
    if (!isRole(session.user.role)) return next();

    req.authSessionId = session.id;
    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      isActive: session.user.isActive,
      mustChangePassword: session.user.mustChangePassword,
    };

    // Slide at most once every 5 minutes to avoid a write per request.
    if (session.expiresAt.getTime() - now < sessionTtlMs - 5 * 60_000) {
      const nextExpiry = new Date(Math.min(now + sessionTtlMs, session.absoluteExpiresAt.getTime()));
      await prisma.session
        .update({ where: { id: session.id }, data: { expiresAt: nextExpiry, lastUsedAt: new Date(now) } })
        .catch(() => undefined);
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  return next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!can(req.user.role, permission)) {
      return next(forbidden(`Missing permission: ${permission}`, 'FORBIDDEN'));
    }
    return next();
  };
}

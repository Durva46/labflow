import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { unauthorized, badRequest, conflict } from '../../lib/errors';
import { hashPassword, verifyDummyPassword, verifyPassword, passwordIssues } from '../../lib/password';
import { recordAudit } from '../../lib/audit';
import { isRole, permissionsFor } from '../../lib/permissions';
import { serialiseUser } from '../users/serialise';
import type { AuthUser } from '../../types';
import type { Request } from 'express';

const INVALID = () => unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');

export type LoginContext = { ip?: string | null; requestId: string; userAgent?: string | null };

export async function authenticate(emailInput: string, password: string, ctx: LoginContext) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyDummyPassword(password);
    await recordAudit({
      actorEmail: email,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      metadata: { reason: 'unknown_account' },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw INVALID();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyDummyPassword(password);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'locked' },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw INVALID();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= env.LOGIN_MAX_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : failedLoginCount,
        lockedUntil: shouldLock ? new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'bad_password', locked: shouldLock },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw INVALID();
  }

  if (!user.isActive) {
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'inactive' },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw INVALID();
  }

  if (!isRole(user.role)) {
    throw INVALID();
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: user.id,
    ip: ctx.ip,
    requestId: ctx.requestId,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

export function meResponse(user: AuthUser) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    },
    permissions: permissionsFor(user.role),
  };
}

export async function changePassword(
  user: AuthUser,
  currentPassword: string,
  newPassword: string,
  ctx: { requestId: string; ip?: string | null; sessionId?: string },
) {
  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record) throw unauthorized();

  const ok = await verifyPassword(currentPassword, record.passwordHash);
  if (!ok) {
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'PASSWORD_CHANGE_FAILED',
      entityType: 'User',
      entityId: user.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    throw badRequest('INVALID_CURRENT_PASSWORD', 'The current password is incorrect.');
  }

  const issues = passwordIssues(newPassword);
  if (issues.length > 0) {
    throw badRequest('WEAK_PASSWORD', 'The new password does not meet the password policy.', issues.map((message) => ({ message })));
  }
  if (currentPassword === newPassword) {
    throw conflict('PASSWORD_REUSED', 'The new password must be different from the current password.');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: user.id, ...(ctx.sessionId ? { id: { not: ctx.sessionId } } : {}) } });
    await recordAudit(
      {
        actorId: user.id,
        actorEmail: user.email,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      },
      tx,
    );
  });
}

export async function destroySession(sessionId: string | undefined, req: Request): Promise<void> {
  if (!sessionId) return;
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
  if (req.user) {
    await recordAudit({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: req.user.id,
      ip: req.ip,
      requestId: req.requestId,
    });
  }
}

export { serialiseUser };

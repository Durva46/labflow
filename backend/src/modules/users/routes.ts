import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validateBody, validateQuery, query } from '../../middleware/validate';
import { idParam, paginationMeta, paginationQuery } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { hashPassword, passwordIssues } from '../../lib/password';
import { recordAudit } from '../../lib/audit';
import { isRole, permissionsFor, ROLES } from '../../lib/permissions';
import { serialiseUser } from '../users/serialise';

const router = Router();

const listQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
  role: z.enum(ROLES),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const resetSchema = z.object({
  newPassword: z.string().min(1).max(128),
});

router.get(
  '/',
  requirePermission('users:read'),
  validateQuery(listQuery),
  asyncHandler(async (_req, res) => {
    const q = query<z.infer<typeof listQuery>>(res);
    const where = q.search
      ? { OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }] }
      : {};
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    res.json({ data: rows.map(serialiseUser), meta: paginationMeta(q.page, q.pageSize, total) });
  }),
);

router.post(
  '/',
  requirePermission('users:write'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const issues = passwordIssues(body.password);
    if (issues.length > 0) {
      throw badRequest('WEAK_PASSWORD', 'The temporary password does not meet the password policy.', issues.map((message) => ({ message })));
    }
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict('EMAIL_EXISTS', 'A user with this email address already exists.');

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      const record = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash,
          role: body.role,
          isActive: true,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
        },
      });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: record.id,
          metadata: { email: record.email, role: record.role },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return record;
    });

    res.status(201).json({ data: serialiseUser(user) });
  }),
);

router.patch(
  '/:id',
  requirePermission('users:write'),
  validateBody(patchSchema),
  validateQuery(z.object({})),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof patchSchema>;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found.');

    if (req.params.id === req.user!.id) {
      if (body.isActive === false) throw conflict('SELF_ACTION_FORBIDDEN', 'You cannot deactivate your own account.');
      if (body.role && body.role !== req.user!.role) throw conflict('SELF_ACTION_FORBIDDEN', 'You cannot change your own role.');
    }

    if (body.role && !isRole(body.role)) throw badRequest('INVALID_ROLE', 'Invalid role.');

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.user.update({
        where: { id: target.id },
        data: body,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
        },
      });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: record.id,
          metadata: { changedFields: Object.keys(body), email: record.email },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return record;
    });

    res.json({ data: serialiseUser(updated) });
  }),
);

router.post(
  '/:id/reset-password',
  requirePermission('users:write'),
  validateBody(resetSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof resetSchema>;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found.');

    const issues = passwordIssues(body.newPassword);
    if (issues.length > 0) {
      throw badRequest('WEAK_PASSWORD', 'The new password does not meet the password policy.', issues.map((message) => ({ message })));
    }

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'PASSWORD_RESET_BY_ADMIN',
          entityType: 'User',
          entityId: target.id,
          metadata: { email: target.email },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
    });

    res.status(204).send();
  }),
);

export default router;

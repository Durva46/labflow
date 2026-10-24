import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateQuery, query } from '../../middleware/validate';
import { paginationMeta, paginationQuery } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';

const router = Router();

const querySchema = paginationQuery.extend({
  entityType: z.string().trim().max(60).optional(),
});

router.get(
  '/',
  requirePermission('audit:read'),
  validateQuery(querySchema),
  asyncHandler(async (_req, res) => {
    const q = query<z.infer<typeof querySchema>>(res);
    const where = q.entityType ? { entityType: q.entityType } : {};
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    res.json({
      data: rows.map((row) => ({
        id: row.id,
        actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : { id: null, name: null, email: row.actorEmail },
        actorEmail: row.actorEmail,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        ip: row.ip,
        requestId: row.requestId,
        createdAt: row.createdAt,
      })),
      meta: paginationMeta(q.page, q.pageSize, total),
    });
  }),
);

export default router;

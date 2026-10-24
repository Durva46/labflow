import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery, query } from '../../middleware/validate';
import { idParam, isoDateString, paginationMeta, paginationQuery } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { isoDate } from '../../lib/time';

const router = Router();

const baseFields = {
  preparationDate: isoDateString,
  mediaType: z.string().trim().min(1).max(100),
  batchNo: z.string().trim().max(100).nullish(),
  quantity: z.coerce.number().finite().positive().max(1_000_000).nullish(),
  unit: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(1000).nullish(),
};

const createSchema = z.object({
  sampleId: z.string().max(64).nullish(),
  ...baseFields,
});

const patchSchema = z
  .object({
    preparationDate: isoDateString.optional(),
    mediaType: z.string().trim().min(1).max(100).optional(),
    batchNo: z.string().trim().max(100).nullish(),
    quantity: z.coerce.number().finite().positive().max(1_000_000).nullish(),
    unit: z.string().trim().max(20).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    status: z.enum(['DRAFT', 'RECORDED']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const listQuery = paginationQuery.extend({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(['DRAFT', 'RECORDED']).optional(),
  search: z.string().trim().max(100).optional(),
});

const parseDateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

function serialise(row: {
  id: string;
  sampleId: string | null;
  preparationDate: Date;
  mediaType: string;
  batchNo: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { id: string; name: string } | null;
  updatedBy?: { id: string; name: string } | null;
  sample?: { id: string; sampleName: string; sampleIdentifier: string | null } | null;
}) {
  return {
    id: row.id,
    sampleId: row.sampleId,
    sampleName: row.sample?.sampleName ?? null,
    sampleIdentifier: row.sample?.sampleIdentifier ?? null,
    preparationDate: row.preparationDate,
    mediaType: row.mediaType,
    batchNo: row.batchNo,
    quantity: row.quantity,
    unit: row.unit,
    notes: row.notes,
    status: row.status,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const includeRelations = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  sample: { select: { id: true, sampleName: true, sampleIdentifier: true } },
} as const;

router.get(
  '/',
  requirePermission('media:read'),
  validateQuery(listQuery),
  asyncHandler(async (_req, res) => {
    const q = query<z.infer<typeof listQuery>>(res);
    const now = new Date();
    const year = q.year ?? now.getUTCFullYear();
    const month = q.month ?? now.getUTCMonth() + 1;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const where = {
      preparationDate: q.month || q.year ? { gte: start, lt: end } : undefined,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { OR: [{ mediaType: { contains: q.search } }, { batchNo: { contains: q.search } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.mediaPreparation.count({ where }),
      prisma.mediaPreparation.findMany({
        where,
        include: includeRelations,
        orderBy: [{ preparationDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    res.json({ data: rows.map(serialise), meta: paginationMeta(q.page, q.pageSize, total) });
  }),
);

router.post(
  '/',
  requirePermission('media:write'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    if (body.sampleId) {
      const sample = await prisma.sample.findUnique({ where: { id: body.sampleId }, select: { id: true } });
      if (!sample) throw badRequest('UNKNOWN_SAMPLE', 'The selected sample does not exist.');
    }

    const duplicate = await prisma.mediaPreparation.findFirst({
      where: {
        sampleId: body.sampleId ?? null,
        preparationDate: parseDateOnly(body.preparationDate),
        mediaType: body.mediaType,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('DUPLICATE_PREPARATION', 'A preparation with the same sample, date and media type already exists.', {
        existingId: duplicate.id,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.mediaPreparation.create({
        data: {
          sampleId: body.sampleId ?? null,
          preparationDate: parseDateOnly(body.preparationDate),
          mediaType: body.mediaType,
          batchNo: body.batchNo ?? null,
          quantity: body.quantity ?? null,
          unit: body.unit ?? null,
          notes: body.notes ?? null,
          status: 'DRAFT',
          createdById: req.user!.id,
        },
        include: includeRelations,
      });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'MEDIA_PREPARATION_CREATED',
          entityType: 'MediaPreparation',
          entityId: record.id,
          metadata: {
            sampleId: record.sampleId,
            preparationDate: isoDate(record.preparationDate),
            mediaType: record.mediaType,
            batchNo: record.batchNo,
            quantity: record.quantity,
            unit: record.unit,
          },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return record;
    });

    res.status(201).json({ data: serialise(created) });
  }),
);

router.get(
  '/:id',
  requirePermission('media:read'),
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const row = await prisma.mediaPreparation.findUnique({ where: { id: req.params.id }, include: includeRelations });
    if (!row) throw notFound('Media preparation record not found.');
    res.json({ data: serialise(row) });
  }),
);

router.patch(
  '/:id',
  requirePermission('media:write'),
  validateParams(idParam),
  validateBody(patchSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.mediaPreparation.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Media preparation record not found.');

    const body = req.body as z.infer<typeof patchSchema>;
    const data: Record<string, unknown> = { updatedById: req.user!.id };
    if (body.preparationDate !== undefined) data.preparationDate = parseDateOnly(body.preparationDate);
    if (body.mediaType !== undefined) data.mediaType = body.mediaType;
    if (body.batchNo !== undefined) data.batchNo = body.batchNo;
    if (body.quantity !== undefined) data.quantity = body.quantity;
    if (body.unit !== undefined) data.unit = body.unit;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = body.status;

    const nextDate = body.preparationDate ? parseDateOnly(body.preparationDate) : existing.preparationDate;
    const nextType = body.mediaType ?? existing.mediaType;
    const duplicate = await prisma.mediaPreparation.findFirst({
      where: {
        id: { not: existing.id },
        sampleId: existing.sampleId,
        preparationDate: nextDate,
        mediaType: nextType,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('DUPLICATE_PREPARATION', 'Another preparation already uses this sample, date and media type.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.mediaPreparation.update({
        where: { id: existing.id },
        data,
        include: includeRelations,
      });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'MEDIA_PREPARATION_UPDATED',
          entityType: 'MediaPreparation',
          entityId: record.id,
          metadata: { changedFields: Object.keys(body), status: record.status },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return record;
    });

    res.json({ data: serialise(updated) });
  }),
);

export default router;

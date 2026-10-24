import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery, query } from '../../middleware/validate';
import { idParam, monthYearQuery, paginationMeta, paginationQuery } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { toCsv } from '../../lib/sanitize';
import { isoDate, monthRange } from '../../lib/time';
import { SAMPLE_CATEGORIES, type SampleCategory } from '../imports/types';
import { optionalMonthYearQuery } from '../../lib/schemas';

const router = Router();

const listQuery = paginationQuery.extend({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  category: z.enum(['WATER', 'NON_WATER', 'UNKNOWN']).optional(),
  search: z.string().trim().max(100).optional(),
});

router.get(
  '/daily-summary',
  requirePermission('samples:read'),
  validateQuery(monthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof monthYearQuery>>(res);
    const { start, end } = monthRange(year, month);
    const samples = await prisma.sample.findMany({
      where: { registrationDate: { gte: start, lt: end } },
      select: { registrationDate: true, sampleCategory: true },
    });
    const map = new Map<string, { date: string; total: number; water: number; nonWater: number; unknown: number }>();
    for (const s of samples) {
      const key = isoDate(s.registrationDate);
      const entry = map.get(key) ?? { date: key, total: 0, water: 0, nonWater: 0, unknown: 0 };
      entry.total += 1;
      if (s.sampleCategory === 'WATER') entry.water += 1;
      else if (s.sampleCategory === 'NON_WATER') entry.nonWater += 1;
      else entry.unknown += 1;
      map.set(key, entry);
    }
    const days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    const totals = days.reduce(
      (acc, d) => ({
        total: acc.total + d.total,
        water: acc.water + d.water,
        nonWater: acc.nonWater + d.nonWater,
        unknown: acc.unknown + d.unknown,
      }),
      { total: 0, water: 0, nonWater: 0, unknown: 0 },
    );
    res.json({ data: { days, totals } });
  }),
);

router.get(
  '/',
  requirePermission('samples:read'),
  validateQuery(listQuery),
  asyncHandler(async (_req, res) => {
    const q = query<z.infer<typeof listQuery>>(res);
    const { start, end } = monthRange(q.year ?? new Date().getUTCFullYear(), q.month ?? new Date().getUTCMonth() + 1);
    const where = {
      registrationDate: { gte: start, lt: end },
      ...(q.category ? { sampleCategory: q.category } : {}),
      ...(q.search
        ? {
            OR: [
              { sampleName: { contains: q.search } },
              { sampleIdentifier: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.sample.count({ where }),
      prisma.sample.findMany({
        where,
        orderBy: [{ registrationDate: 'asc' }, { sampleName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { import: { select: { id: true, filename: true } } },
      }),
    ]);
    res.json({
      data: rows.map((s) => ({
        id: s.id,
        sampleIdentifier: s.sampleIdentifier,
        sampleName: s.sampleName,
        registrationDate: s.registrationDate,
        sampleCategory: s.sampleCategory,
        importId: s.importId,
        importFilename: s.import.filename,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      meta: paginationMeta(q.page, q.pageSize, total),
    });
  }),
);

router.get(
  '/:id',
  requirePermission('samples:read'),
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const sample = await prisma.sample.findUnique({
      where: { id: req.params.id },
      include: { import: { select: { id: true, filename: true, reportingMonth: true, reportingYear: true } } },
    });
    if (!sample) throw notFound('Sample not found.');
    res.json({
      data: {
        id: sample.id,
        sampleIdentifier: sample.sampleIdentifier,
        sampleName: sample.sampleName,
        registrationDate: sample.registrationDate,
        sampleCategory: sample.sampleCategory,
        categorySource: sample.categorySource,
        importId: sample.importId,
        import: sample.import,
        createdAt: sample.createdAt,
        updatedAt: sample.updatedAt,
      },
    });
  }),
);

// Unused import guard (kept explicit so the category list stays in sync with types).
void SAMPLE_CATEGORIES;
void badRequest;
void optionalMonthYearQuery;
void toCsv;
void (null as unknown as SampleCategory);

export default router;

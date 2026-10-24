import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateBody, validateQuery, query } from '../../middleware/validate';
import { optionalMonthYearQuery, paginationMeta } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { monthRange } from '../../lib/time';
import { generateCleaningSchedule, listCleaning, summariseCleaning } from '../autoclave/service';

const router = Router();

router.get(
  '/',
  requirePermission('dashboard:read'),
  validateQuery(optionalMonthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof optionalMonthYearQuery>>(res);
    const { start, end } = monthRange(year, month);

    const [importRow, sampleGroups, mediaRows, logRows, cleaningRows, recent] = await Promise.all([
      prisma.monthlyImport.findFirst({ where: { reportingMonth: month, reportingYear: year }, orderBy: { createdAt: 'desc' } }),
      prisma.sample.groupBy({
        by: ['sampleCategory'],
        where: { registrationDate: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      prisma.mediaPreparation.findMany({
        where: { preparationDate: { gte: start, lt: end } },
        select: { status: true },
      }),
      prisma.autoclaveLog.findMany({
        where: { logDate: { gte: start, lt: end } },
        select: { verificationStatus: true },
      }),
      prisma.autoclaveCleaning.findMany({
        where: { scheduledDate: { gte: start, lt: end } },
        select: { scheduledDate: true, completedAt: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, action: true, entityType: true, entityId: true, actorEmail: true, createdAt: true },
      }),
    ]);

    const counts = { total: 0, WATER: 0, NON_WATER: 0, UNKNOWN: 0 };
    for (const group of sampleGroups) {
      const c = group._count._all;
      if (group.sampleCategory === 'WATER') counts.WATER = c;
      else if (group.sampleCategory === 'NON_WATER') counts.NON_WATER = c;
      else counts.UNKNOWN = c;
      counts.total += c;
    }

    const media = { total: mediaRows.length, draft: 0, recorded: 0 };
    for (const m of mediaRows) {
      if (m.status === 'RECORDED') media.recorded += 1;
      else media.draft += 1;
    }

    const autoclave = { total: logRows.length, draft: 0, pendingVerification: 0, verified: 0 };
    for (const l of logRows) {
      if (l.verificationStatus === 'VERIFIED') autoclave.verified += 1;
      else if (l.verificationStatus === 'PENDING_VERIFICATION') autoclave.pendingVerification += 1;
      else autoclave.draft += 1;
    }

    const cleaningList = await listCleaning(month, year);
    const cleaningSummary = summariseCleaning(cleaningList.map((c) => ({ scheduledDate: c.scheduledDate, completedAt: c.completedAt })));

    res.json({
      data: {
        reportingMonth: month,
        reportingYear: year,
        importStatus: importRow
          ? {
              state: importRow.status,
              import: {
                id: importRow.id,
                filename: importRow.filename,
                status: importRow.status,
                acceptedRows: importRow.acceptedRows,
                totalRows: importRow.totalRows,
                reportingMonth: importRow.reportingMonth,
                reportingYear: importRow.reportingYear,
                createdAt: importRow.createdAt,
                completedAt: importRow.completedAt,
              },
            }
          : { state: 'NONE', import: null },
        samples: { total: counts.total, water: counts.WATER, nonWater: counts.NON_WATER, unknown: counts.UNKNOWN },
        media,
        autoclave,
        cleaning: { ...cleaningSummary, items: cleaningList.slice(0, 8) },
        recentActivity: recent.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actorName: r.actorEmail,
          createdAt: r.createdAt,
        })),
      },
    });
  }),
);

void generateCleaningSchedule;
void paginationMeta;
void z;

export default router;

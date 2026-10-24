import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery, query } from '../../middleware/validate';
import { idParam, isoDateString, monthYearQuery, optionalMonthYearQuery, timeString } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { addMinutesToTime, isoDate, monthRange, startOfUtcDay } from '../../lib/time';
import { can } from '../../lib/permissions';
import { recordAudit } from '../../lib/audit';
import { getAutoclaveSettings } from '../settings/service';
import { generateCleaningSchedule, listCleaning } from './service';

const router = Router();

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

const generateSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const logListQuery = z
  .object({
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    status: z.enum(['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED']).optional(),
  })
  .transform((v) => {
    const now = new Date();
    return { month: v.month ?? now.getUTCMonth() + 1, year: v.year ?? now.getUTCFullYear(), status: v.status };
  })
  .refine((v) => v.month >= 1 && v.month <= 12);

const logInclude = {
  responsible: { select: { id: true, name: true } },
  sample: { select: { id: true, sampleName: true } },
} as const;

function serialiseLog(row: {
  id: string;
  logDate: Date;
  cycleLoadName: string;
  sampleId: string | null;
  mediaPreparationId: string | null;
  autoclaveStartTime: string;
  sterilizationStartTime: string;
  temperature: number;
  temperatureUnit: string;
  pressure: number;
  pressureUnit: string;
  sterilizationDurationMinutes: number;
  endTime: string;
  endTimeOverridden: boolean;
  verificationStatus: string;
  responsibleUserId: string | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  responsible?: { id: string; name: string } | null;
  sample?: { id: string; sampleName: string } | null;
}) {
  return {
    id: row.id,
    logDate: row.logDate,
    cycleLoadName: row.cycleLoadName,
    sampleId: row.sampleId,
    mediaPreparationId: row.mediaPreparationId,
    autoclaveStartTime: row.autoclaveStartTime,
    sterilizationStartTime: row.sterilizationStartTime,
    temperature: row.temperature,
    temperatureUnit: row.temperatureUnit,
    pressure: row.pressure,
    pressureUnit: row.pressureUnit,
    sterilizationDurationMinutes: row.sterilizationDurationMinutes,
    endTime: row.endTime,
    endTimeOverridden: row.endTimeOverridden,
    verificationStatus: row.verificationStatus,
    responsibleUserId: row.responsibleUserId,
    responsibleUser: row.responsible ?? null,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Log book
// ---------------------------------------------------------------------------

router.get(
  '/autoclave-logs',
  requirePermission('autoclave:read'),
  validateQuery(logListQuery),
  asyncHandler(async (_req, res) => {
    const q = query<z.infer<typeof logListQuery>>(res);
    const { start, end } = monthRange(q.year, q.month);
    const rows = await prisma.autoclaveLog.findMany({
      where: { logDate: { gte: start, lt: end }, ...(q.status ? { verificationStatus: q.status } : {}) },
      include: logInclude,
      orderBy: [{ logDate: 'asc' }, { cycleLoadName: 'asc' }],
    });
    res.json({ data: rows.map(serialiseLog) });
  }),
);

router.post(
  '/autoclave-logs/generate',
  requirePermission('autoclave:write'),
  validateBody(generateSchema),
  asyncHandler(async (req, res) => {
    const { month, year } = req.body as z.infer<typeof generateSchema>;
    const { start, end } = monthRange(year, month);

    const samples = await prisma.sample.findMany({
      where: { registrationDate: { gte: start, lt: end } },
      select: { registrationDate: true },
      orderBy: { registrationDate: 'asc' },
    });
    if (samples.length === 0) {
      throw new AppError(422, 'NO_SAMPLES', 'There are no registered samples for this month. Upload the monthly report first.');
    }

    const settings = await getAutoclaveSettings();
    const byDay = new Map<string, { date: Date; count: number }>();
    for (const sample of samples) {
      const key = isoDate(sample.registrationDate);
      const entry = byDay.get(key) ?? { date: startOfUtcDay(sample.registrationDate), count: 0 };
      entry.count += 1;
      byDay.set(key, entry);
    }

    let created = 0;
    let skipped = 0;
    const defaults = {
      autoclaveStartTime: settings.autoclaveStartTime,
      sterilizationStartTime: settings.sterilizationStartTime,
      temperature: settings.temperature,
      temperatureUnit: settings.temperatureUnit,
      pressure: settings.pressure,
      pressureUnit: settings.pressureUnit,
      sterilizationDurationMinutes: settings.durationMinutes,
    };
    const endTime = addMinutesToTime(defaults.sterilizationStartTime, defaults.sterilizationDurationMinutes);

    for (const [, day] of byDay) {
      const cycleLoadName = `Daily load - ${isoDate(day.date)}`;
      const existing = await prisma.autoclaveLog.findUnique({
        where: { logDate_cycleLoadName: { logDate: day.date, cycleLoadName } },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await prisma.$transaction(async (tx) => {
        const record = await tx.autoclaveLog.create({
          data: {
            logDate: day.date,
            cycleLoadName,
            ...defaults,
            endTime,
            endTimeOverridden: false,
            verificationStatus: 'DRAFT',
            responsibleUserId: req.user!.id,
            createdById: req.user!.id,
          },
        });
        await recordAudit(
          {
            actorId: req.user!.id,
            actorEmail: req.user!.email,
            action: 'AUTOCLAVE_DRAFT_GENERATED',
            entityType: 'AutoclaveLog',
            entityId: record.id,
            metadata: { logDate: isoDate(day.date), cycleLoadName, sampleCount: day.count, groupingRule: settings.groupingRule },
            ip: req.ip,
            requestId: req.requestId,
          },
          tx,
        );
      });
      created += 1;
    }

    res.status(201).json({ data: { created, skipped, groupingRule: settings.groupingRule } });
  }),
);

router.get(
  '/autoclave-logs/:id',
  requirePermission('autoclave:read'),
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const row = await prisma.autoclaveLog.findUnique({ where: { id: req.params.id }, include: logInclude });
    if (!row) throw notFound('Autoclave log entry not found.');
    res.json({ data: serialiseLog(row) });
  }),
);

const patchSchema = z
  .object({
    cycleLoadName: z.string().trim().min(1).max(120).optional(),
    autoclaveStartTime: timeString.optional(),
    sterilizationStartTime: timeString.optional(),
    temperature: z.coerce.number().finite().min(0).max(200).optional(),
    temperatureUnit: z.enum(['C', 'F']).optional(),
    pressure: z.coerce.number().finite().min(0).max(500).optional(),
    pressureUnit: z.enum(['LBS', 'BAR', 'KPA']).optional(),
    sterilizationDurationMinutes: z.coerce.number().int().min(1).max(600).optional(),
    endTime: timeString.optional(),
    endTimeOverridden: z.boolean().optional(),
    verificationStatus: z.enum(['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED']).optional(),
    responsibleUserId: z.string().max(64).nullish(),
    remarks: z.string().trim().max(1000).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_VERIFICATION', 'VERIFIED'],
  PENDING_VERIFICATION: ['DRAFT', 'VERIFIED'],
  VERIFIED: ['DRAFT'],
};

router.patch(
  '/autoclave-logs/:id',
  requirePermission('autoclave:write'),
  validateParams(idParam),
  validateBody(patchSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.autoclaveLog.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Autoclave log entry not found.');

    const body = req.body as z.infer<typeof patchSchema>;
    const isAdmin = req.user!.role === 'ADMIN';

    if (existing.verificationStatus === 'VERIFIED') {
      const onlyReopen =
        Object.keys(body).length === 1 && body.verificationStatus === 'DRAFT' && isAdmin;
      if (!onlyReopen) {
        throw conflict(
          'RECORD_VERIFIED',
          'This record is verified and cannot be edited. An administrator must reopen it first.',
        );
      }
    }

    if (body.verificationStatus && body.verificationStatus !== existing.verificationStatus) {
      const allowed = TRANSITIONS[existing.verificationStatus] ?? [];
      if (!allowed.includes(body.verificationStatus)) {
        throw conflict('INVALID_STATUS_TRANSITION', 'That verification status change is not allowed.');
      }
      if (body.verificationStatus === 'VERIFIED' && !can(req.user!.role, 'autoclave:verify')) {
        throw forbidden('You are not allowed to verify autoclave records.', 'VERIFICATION_NOT_ALLOWED');
      }
      if (existing.verificationStatus === 'VERIFIED' && !isAdmin) {
        throw forbidden('Only an administrator can reopen a verified record.');
      }
    }

    if (body.responsibleUserId) {
      const user = await prisma.user.findUnique({ where: { id: body.responsibleUserId }, select: { isActive: true } });
      if (!user) throw badRequest('UNKNOWN_USER', 'The selected responsible person does not exist.');
      if (!user.isActive) throw badRequest('INACTIVE_USER', 'The selected responsible person is not active.');
    }

    const sterilizationStartTime = body.sterilizationStartTime ?? existing.sterilizationStartTime;
    const durationMinutes = body.sterilizationDurationMinutes ?? existing.sterilizationDurationMinutes;
    const computedEnd = addMinutesToTime(sterilizationStartTime, durationMinutes);

    let endTime = existing.endTime;
    let endTimeOverridden = existing.endTimeOverridden;

    if (body.endTimeOverridden === false) {
      endTime = computedEnd;
      endTimeOverridden = false;
    } else if (body.endTime !== undefined) {
      endTime = body.endTime;
      endTimeOverridden = body.endTime !== computedEnd;
    } else if (!endTimeOverridden) {
      endTime = computedEnd;
    }

    const data: Record<string, unknown> = { endTime, endTimeOverridden };
    for (const key of [
      'cycleLoadName',
      'autoclaveStartTime',
      'sterilizationStartTime',
      'temperature',
      'temperatureUnit',
      'pressure',
      'pressureUnit',
      'sterilizationDurationMinutes',
      'verificationStatus',
      'remarks',
    ] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.responsibleUserId !== undefined) data.responsibleUserId = body.responsibleUserId;

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.autoclaveLog.update({ where: { id: existing.id }, data, include: logInclude });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action:
            body.verificationStatus === 'VERIFIED'
              ? 'AUTOCLAVE_VERIFIED'
              : existing.verificationStatus === 'VERIFIED'
                ? 'AUTOCLAVE_REOPENED'
                : 'AUTOCLAVE_UPDATED',
          entityType: 'AutoclaveLog',
          entityId: record.id,
          metadata: {
            changedFields: Object.keys(body),
            endTime,
            endTimeOverridden,
            verificationStatus: record.verificationStatus,
          },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return record;
    });

    res.json({ data: serialiseLog(updated) });
  }),
);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settingsSchema = z
  .object({
    labName: z.string().trim().min(1).max(160).optional(),
    labAddress: z.string().trim().max(200).optional(),
    documentFormatNo: z.string().trim().max(60).optional(),
    documentSopReference: z.string().trim().max(60).optional(),
    equipmentNumber: z.string().trim().max(60).optional(),
    autoclaveStartTime: timeString.optional(),
    sterilizationStartTime: timeString.optional(),
    temperature: z.coerce.number().finite().min(0).max(200).optional(),
    temperatureUnit: z.enum(['C', 'F']).optional(),
    pressure: z.coerce.number().finite().min(0).max(500).optional(),
    pressureUnit: z.enum(['LBS', 'BAR', 'KPA']).optional(),
    durationMinutes: z.coerce.number().int().min(1).max(600).optional(),
    cleaningAnchorDate: isoDateString.optional(),
    cleaningFirstIntervalDays: z.coerce.number().int().min(1).max(31).optional(),
    cleaningIntervalDays: z.coerce.number().int().min(1).max(31).optional(),
    groupingRule: z.literal('PER_DAY').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

function serialiseSettings(row: Awaited<ReturnType<typeof getAutoclaveSettings>>) {
  return {
    id: row.id,
    labName: row.labName,
    labAddress: row.labAddress,
    documentFormatNo: row.documentFormatNo,
    documentSopReference: row.documentSopReference,
    equipmentNumber: row.equipmentNumber,
    autoclaveStartTime: row.autoclaveStartTime,
    sterilizationStartTime: row.sterilizationStartTime,
    temperature: row.temperature,
    temperatureUnit: row.temperatureUnit,
    pressure: row.pressure,
    pressureUnit: row.pressureUnit,
    durationMinutes: row.durationMinutes,
    cleaningAnchorDate: row.cleaningAnchorDate,
    cleaningFirstIntervalDays: row.cleaningFirstIntervalDays,
    cleaningIntervalDays: row.cleaningIntervalDays,
    groupingRule: row.groupingRule,
    updatedAt: row.updatedAt,
  };
}

router.get(
  '/autoclave-settings',
  requirePermission('settings:read'),
  asyncHandler(async (_req, res) => {
    res.json({ data: serialiseSettings(await getAutoclaveSettings()) });
  }),
);

router.patch(
  '/autoclave-settings',
  requirePermission('settings:write'),
  validateBody(settingsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof settingsSchema>;
    const current = await getAutoclaveSettings();
    const data: Record<string, unknown> = { ...body };
    if (body.cleaningAnchorDate) data.cleaningAnchorDate = dateOnly(body.cleaningAnchorDate);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.autoclaveSettings.update({ where: { id: current.id }, data });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'AUTOCLAVE_SETTINGS_UPDATED',
          entityType: 'AutoclaveSettings',
          entityId: row.id,
          metadata: { changedFields: Object.keys(body) },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return row;
    });
    res.json({ data: serialiseSettings(updated) });
  }),
);

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

router.get(
  '/autoclave-cleaning',
  requirePermission('autoclave:read'),
  validateQuery(optionalMonthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof optionalMonthYearQuery>>(res);
    res.json({ data: await listCleaning(month, year) });
  }),
);

router.post(
  '/autoclave-cleaning/generate',
  requirePermission('autoclave:write'),
  validateBody(generateSchema),
  asyncHandler(async (req, res) => {
    const { month, year } = req.body as z.infer<typeof generateSchema>;
    const result = await generateCleaningSchedule(month, year);
    await recordAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'CLEANING_SCHEDULE_GENERATED',
      entityType: 'AutoclaveCleaning',
      metadata: { month, year, created: result.created, skipped: result.skipped },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ data: result });
  }),
);

const completeSchema = z.object({
  completedAt: isoDateString.optional(),
  responsibleUserId: z.string().max(64).nullish(),
  remarks: z.string().trim().max(500).nullish(),
});

router.post(
  '/autoclave-cleaning/:id/complete',
  requirePermission('cleaning:write'),
  validateParams(idParam),
  validateBody(completeSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.autoclaveCleaning.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Cleaning record not found.');
    if (existing.completedAt) {
      throw conflict('ALREADY_COMPLETED', 'This cleaning has already been recorded as completed.');
    }

    const body = req.body as z.infer<typeof completeSchema>;
    if (body.responsibleUserId) {
      const user = await prisma.user.findUnique({ where: { id: body.responsibleUserId }, select: { isActive: true } });
      if (!user) throw badRequest('UNKNOWN_USER', 'The selected responsible person does not exist.');
      if (!user.isActive) throw badRequest('INACTIVE_USER', 'The selected responsible person is not active.');
    }

    const completedAt = body.completedAt ? dateOnly(body.completedAt) : startOfUtcDay(new Date());

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.autoclaveCleaning.update({
        where: { id: existing.id },
        data: {
          completedAt,
          status: 'COMPLETED',
          responsibleUserId: body.responsibleUserId ?? req.user!.id,
          remarks: body.remarks ?? existing.remarks,
        },
        include: { responsible: { select: { id: true, name: true } } },
      });
      await recordAudit(
        {
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'CLEANING_COMPLETED',
          entityType: 'AutoclaveCleaning',
          entityId: record.id,
          metadata: {
            scheduledDate: isoDate(record.scheduledDate),
            completedAt: isoDate(completedAt),
            responsibleUserId: record.responsibleUserId,
          },
          ip: req.ip,
          requestId: req.requestId,
        },
        tx,
      );
      return record;
    });

    res.json({
      data: {
        id: updated.id,
        scheduledDate: updated.scheduledDate,
        completedAt: updated.completedAt,
        status: 'COMPLETED',
        responsibleUser: updated.responsible ? { id: updated.responsible.id, name: updated.responsible.name } : null,
        responsibleUserId: updated.responsibleUserId,
        remarks: updated.remarks,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  }),
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validateBody, validateQuery, query } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { getAppConfig, saveAppConfig } from '../settings/service';
import { recordAudit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { optionalMonthYearQuery } from '../../lib/schemas';

const router = Router();

router.get(
  '/',
  requireAuth,
  validateQuery(optionalMonthYearQuery),
  asyncHandler(async (_req, res) => {
    const cfg = await getAppConfig();
    res.json({
      data: {
        labName: 'PETLAD MAHAL AROGYA MANDAL PHARMACY',
        labAddress: 'Piplata',
        documentFormatNo: '',
        documentSopReference: '',
        equipmentNumber: '',
        columnMapping: cfg.columnMapping,
        classificationRules: cfg.classificationRules,
        retentionDays: cfg.retentionDays,
      },
    });
  }),
);

const ruleSchema = z.object({
  match: z.string().trim().min(1).max(200),
  category: z.enum(['WATER', 'NON_WATER']),
});

const patchSchema = z
  .object({
    columnMapping: z
      .object({
        sampleIdentifier: z.string().trim().max(200).nullish(),
        sampleName: z.string().trim().max(200).nullish(),
        registrationDate: z.string().trim().max(200).nullish(),
        sampleCategory: z.string().trim().max(200).nullish(),
      })
      .optional(),
    classificationRules: z.array(ruleSchema).max(100).optional(),
    retentionDays: z.coerce.number().int().min(30).max(36500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

router.patch(
  '/',
  requirePermission('settings:write'),
  validateBody(patchSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof patchSchema>;
    if (body.columnMapping) {
      const cleaned = {
        sampleIdentifier: body.columnMapping.sampleIdentifier ?? null,
        sampleName: body.columnMapping.sampleName ?? null,
        registrationDate: body.columnMapping.registrationDate ?? null,
        sampleCategory: body.columnMapping.sampleCategory ?? null,
      };
      if (cleaned.sampleIdentifier === '') cleaned.sampleIdentifier = null;
      if (cleaned.sampleName === '') cleaned.sampleName = null;
      if (cleaned.registrationDate === '') cleaned.registrationDate = null;
      if (cleaned.sampleCategory === '') cleaned.sampleCategory = null;
      await saveAppConfig({ columnMapping: cleaned });
    }
    if (body.classificationRules) {
      await saveAppConfig({ classificationRules: body.classificationRules });
    }
    if (body.retentionDays !== undefined) {
      await saveAppConfig({ retentionDays: body.retentionDays });
    }

    await recordAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'APP_SETTINGS_UPDATED',
      entityType: 'AppSetting',
      metadata: { changedFields: Object.keys(body) },
      ip: req.ip,
      requestId: req.requestId,
    });

    const cfg = await getAppConfig();
    res.json({
      data: {
        labName: 'PETLAD MAHAL AROGYA MANDAL PHARMACY',
        labAddress: 'Piplata',
        documentFormatNo: '',
        documentSopReference: '',
        equipmentNumber: '',
        columnMapping: cfg.columnMapping,
        classificationRules: cfg.classificationRules,
        retentionDays: cfg.retentionDays,
      },
    });
  }),
);

export default router;

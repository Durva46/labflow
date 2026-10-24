import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery, query } from '../../middleware/validate';
import { idParam, paginationMeta, paginationQuery } from '../../lib/schemas';
import { uploadMonthlyReport, sanitiseFilename } from '../../middleware/upload';
import { badRequest, notFound } from '../../lib/errors';
import { toCsv } from '../../lib/sanitize';
import { recordAudit } from '../../lib/audit';
import {
  getImport,
  getImportErrors,
  listImports,
  processMonthlyImport,
  rollbackImport,
} from './service';
import type { ColumnMapping } from './excel';

const router = Router();

const uploadBody = z.object({
  reportingMonth: z.coerce.number().int().min(1).max(12),
  reportingYear: z.coerce.number().int().min(2000).max(2100),
  replace: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
  columnMapping: z.string().max(4000).optional(),
});

const mappingSchema = z
  .object({
    sampleIdentifier: z.string().max(200).nullish(),
    sampleName: z.string().max(200).nullish(),
    registrationDate: z.string().max(200).nullish(),
    sampleCategory: z.string().max(200).nullish(),
  })
  .strict();

const errorsQuery = z.object({ format: z.enum(['json', 'csv']).default('json') });

router.post(
  '/monthly',
  requirePermission('imports:write'),
  uploadMonthlyReport,
  validateBody(uploadBody),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('FILE_REQUIRED', 'A spreadsheet file is required.');

    const body = req.body as z.infer<typeof uploadBody>;
    let columnMapping: ColumnMapping | undefined;
    if (body.columnMapping) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(body.columnMapping);
      } catch {
        throw badRequest('INVALID_COLUMN_MAPPING', 'The column mapping must be valid JSON.');
      }
      const parsed = mappingSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw badRequest('INVALID_COLUMN_MAPPING', 'The column mapping contains unsupported fields.');
      }
      columnMapping = parsed.data;
    }

    const result = await processMonthlyImport({
      buffer: req.file.buffer,
      originalname: sanitiseFilename(req.file.originalname),
      actor: { id: req.user!.id, email: req.user!.email },
      month: body.reportingMonth,
      year: body.reportingYear,
      replace: body.replace,
      columnMapping,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ data: result });
  }),
);

router.get(
  '/',
  requirePermission('imports:read'),
  validateQuery(paginationQuery),
  asyncHandler(async (_req, res) => {
    const q = query<z.infer<typeof paginationQuery>>(res);
    const { rows, total } = await listImports(q.page, q.pageSize);
    res.json({ data: rows, meta: paginationMeta(q.page, q.pageSize, total) });
  }),
);

router.get(
  '/:id',
  requirePermission('imports:read'),
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const record = await getImport(req.params.id);
    if (!record) throw notFound('Import not found.');
    res.json({ data: record });
  }),
);

router.get(
  '/:id/errors',
  requirePermission('imports:read'),
  validateParams(idParam),
  validateQuery(errorsQuery),
  asyncHandler(async (req, res) => {
    const rows = await getImportErrors(req.params.id);
    if (!rows) throw notFound('Import not found.');
    const format = query<z.infer<typeof errorsQuery>>(res).format;

    if (format === 'csv') {
      const csv = toCsv([
        ['Row', 'Code', 'Message'],
        ...rows.map((r) => [r.rowNumber, r.code, r.message]),
      ]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Import_Validation_Errors.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(`\uFEFF${csv}`);
      return;
    }

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        rowNumber: r.rowNumber,
        code: r.code,
        message: r.message,
        createdAt: r.createdAt,
      })),
    });
  }),
);

router.post(
  '/:id/rollback',
  requirePermission('imports:write'),
  validateParams(idParam),
  validateBody(z.object({ confirm: z.literal(true) })),
  asyncHandler(async (req, res) => {
    await rollbackImport(req.params.id, { id: req.user!.id, email: req.user!.email }, req.ip, req.requestId);
    res.status(204).send();
  }),
);

void recordAudit;

export default router;

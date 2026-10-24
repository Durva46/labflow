import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, conflict, validationError } from '../../lib/errors';
import { sha256 } from '../../lib/crypto';
import { isoDate, monthRange, parseLooseDate } from '../../lib/time';
import { logger } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { env } from '../../config/env';
import { sanitiseFilename, SUPPORTED_EXTENSIONS } from '../../middleware/upload';
import { getAppConfig } from '../settings/service';
import {
  classifyByRules,
  normaliseCategory,
  parseWorkbook,
  resolveMapping,
  type ClassificationRule,
  type ColumnMapping,
  type ParsedSheet,
} from './excel';
import type { SampleCategory } from './types';
import { sanitiseMetadata } from '../../lib/sanitize';

export type ImportActor = { id: string; email: string };
export type UploadInput = {
  buffer: Buffer;
  originalname: string;
  actor: ImportActor;
  month: number;
  year: number;
  replace: boolean;
  columnMapping?: ColumnMapping;
  ip?: string | null;
  requestId: string;
};

type Candidate = {
  rowNumber: number;
  dedupeKey: string;
  sampleIdentifier: string | null;
  sampleName: string;
  registrationDate: Date;
  sampleCategory: SampleCategory;
  categorySource: string;
};

type RowErrorInput = { rowNumber: number; code: string; message: string; rawData?: unknown };

const MAX_NAME = 200;
const MAX_IDENTIFIER = 100;

const normalise = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const errorSummary = (errors: RowErrorInput[]) => {
  const counts = new Map<string, number>();
  for (const e of errors) counts.set(e.code, (counts.get(e.code) ?? 0) + 1);
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
};

function serialiseImport(row: {
  id: string;
  filename: string;
  fileHash: string;
  reportingMonth: number;
  reportingYear: number;
  status: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  sourceFormat: string;
  createdAt: Date;
  completedAt: Date | null;
  uploadedBy?: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    filename: row.filename,
    fileHash: row.fileHash,
    reportingMonth: row.reportingMonth,
    reportingYear: row.reportingYear,
    status: row.status,
    totalRows: row.totalRows,
    acceptedRows: row.acceptedRows,
    rejectedRows: row.rejectedRows,
    duplicateRows: row.duplicateRows,
    sourceFormat: row.sourceFormat,
    uploadedBy: row.uploadedBy ? { id: row.uploadedBy.id, name: row.uploadedBy.name } : null,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

async function parseUpload(buffer: Buffer, format: 'XLSX' | 'CSV'): Promise<ParsedSheet> {
  try {
    return await parseWorkbook(buffer, format);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'UNKNOWN';
    if (reason === 'XLSX_SIGNATURE' || reason === 'CSV_SIGNATURE') {
      throw new AppError(400, 'INVALID_FILE_SIGNATURE', 'The file content does not match its extension.');
    }
    if (reason === 'CSV_STRUCTURE') {
      throw new AppError(400, 'INVALID_WORKBOOK_STRUCTURE', 'The CSV file does not contain a usable table.');
    }
    if (reason === 'EMPTY_WORKBOOK') {
      throw new AppError(422, 'EMPTY_WORKBOOK', 'The workbook does not contain any worksheet data.');
    }
    logger.warn('workbook parse failed', { reason: reason.slice(0, 120) });
    throw new AppError(422, 'MALFORMED_WORKBOOK', 'The file could not be read as a valid spreadsheet.');
  }
}

function validateRows(
  sheet: ParsedSheet,
  mapping: ReturnType<typeof resolveMapping>['mapping'],
  rules: ClassificationRule[],
  range: { start: Date; end: Date },
): { candidates: Candidate[]; errors: RowErrorInput[]; duplicates: number } {
  const candidates: Candidate[] = [];
  const errors: RowErrorInput[] = [];
  const seenKeys = new Map<string, number>();
  let duplicates = 0;

  const rawFor = (cells: unknown[], headers: string[]) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = sanitiseMetadata(cells[i] ?? null);
    });
    return obj;
  };

  for (const row of sheet.rows) {
    const rawData = rawFor(row.cells, sheet.headers);
    const nameCell = mapping.sampleName !== null ? row.cells[mapping.sampleName] : null;
    const dateCell = mapping.registrationDate !== null ? row.cells[mapping.registrationDate] : null;
    const idCell = mapping.sampleIdentifier !== null ? row.cells[mapping.sampleIdentifier] : null;
    const categoryCell = mapping.sampleCategory !== null ? row.cells[mapping.sampleCategory] : null;

    const sampleName = typeof nameCell === 'string' ? nameCell.replace(/\s+/g, ' ').trim() : String(nameCell ?? '').trim();
    if (!sampleName) {
      errors.push({ rowNumber: row.rowNumber, code: 'MISSING_SAMPLE_NAME', message: 'Sample name is empty.', rawData });
      continue;
    }
    if (sampleName.length > MAX_NAME) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'VALUE_TOO_LONG',
        message: `Sample name exceeds ${MAX_NAME} characters.`,
        rawData,
      });
      continue;
    }

    let sampleIdentifier: string | null = null;
    if (idCell !== null && idCell !== undefined) {
      const text = String(idCell).trim();
      if (text) {
        if (text.length > MAX_IDENTIFIER) {
          errors.push({
            rowNumber: row.rowNumber,
            code: 'VALUE_TOO_LONG',
            message: `Sample identifier exceeds ${MAX_IDENTIFIER} characters.`,
            rawData,
          });
          continue;
        }
        sampleIdentifier = text;
      }
    }

    const registrationDate = parseLooseDate(dateCell);
    if (!registrationDate) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'INVALID_DATE',
        message: 'Registration date is missing or is not a recognised date.',
        rawData,
      });
      continue;
    }
    if (registrationDate < range.start || registrationDate >= range.end) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'DATE_OUTSIDE_REPORTING_MONTH',
        message: 'Registration date falls outside the selected reporting month.',
        rawData,
      });
      continue;
    }

    let category: SampleCategory = 'UNKNOWN';
    let categorySource = 'NONE';
    if (mapping.sampleCategory !== null) {
      const raw = categoryCell === null || categoryCell === undefined ? '' : String(categoryCell).trim();
      if (raw) {
        const parsed = normaliseCategory(raw);
        if (!parsed) {
          errors.push({
            rowNumber: row.rowNumber,
            code: 'INVALID_CATEGORY',
            message: `Unrecognised sample category "${raw.slice(0, 40)}".`,
            rawData,
          });
          continue;
        }
        category = parsed;
        categorySource = 'IMPORT';
      }
    }
    if (category === 'UNKNOWN' && rules.length > 0) {
      const derived = classifyByRules(sampleName, rules);
      if (derived) {
        category = derived;
        categorySource = 'MAPPING';
      }
    }

    const dedupeKey = sampleIdentifier
      ? `I:${normalise(sampleIdentifier)}`
      : `N:${normalise(sampleName)}|${isoDate(registrationDate)}`;

    const firstRow = seenKeys.get(dedupeKey);
    if (firstRow !== undefined) {
      duplicates += 1;
      errors.push({
        rowNumber: row.rowNumber,
        code: 'DUPLICATE_IN_FILE',
        message: `Duplicate of row ${firstRow} in this file.`,
        rawData,
      });
      continue;
    }
    seenKeys.set(dedupeKey, row.rowNumber);

    candidates.push({
      rowNumber: row.rowNumber,
      dedupeKey,
      sampleIdentifier,
      sampleName,
      registrationDate,
      sampleCategory: category,
      categorySource,
    });
  }

  return { candidates, errors, duplicates };
}

export async function processMonthlyImport(input: UploadInput) {
  const extension = path.extname(input.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new AppError(400, 'UNSUPPORTED_FILE_TYPE', 'Only .xlsx and .csv files are accepted.');
  }
  const format: 'XLSX' | 'CSV' = extension === '.csv' ? 'CSV' : 'XLSX';
  const filename = sanitiseFilename(input.originalname);
  const fileHash = sha256(input.buffer);
  const range = monthRange(input.year, input.month);

  const duplicateFile = await prisma.monthlyImport.findFirst({
    where: { fileHash, status: 'COMPLETED' },
    select: { id: true, reportingMonth: true, reportingYear: true },
  });
  if (duplicateFile) {
    throw conflict('DUPLICATE_IMPORT', 'This exact file has already been imported.', {
      existingImportId: duplicateFile.id,
      reportingMonth: duplicateFile.reportingMonth,
      reportingYear: duplicateFile.reportingYear,
    });
  }

  const existingMonth = await prisma.monthlyImport.findFirst({
    where: { reportingMonth: input.month, reportingYear: input.year, status: 'COMPLETED' },
    include: { _count: { select: { samples: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (existingMonth && !input.replace) {
    throw conflict('IMPORT_EXISTS', 'A report for this month already exists. Confirm replacement to continue.', {
      existingImportId: existingMonth.id,
      acceptedRows: existingMonth.acceptedRows,
    });
  }

  if (existingMonth && input.replace) {
    const dependentMedia = await prisma.mediaPreparation.count({
      where: { sample: { importId: existingMonth.id } },
    });
    const dependentLogs = await prisma.autoclaveLog.count({
      where: { sample: { importId: existingMonth.id } },
    });
    if (dependentMedia > 0 || dependentLogs > 0) {
      throw conflict(
        'REPLACE_BLOCKED',
        'This month already has media preparation or autoclave records. Replacement is blocked to protect those records.',
        { existingImportId: existingMonth.id, dependentMedia, dependentLogs },
      );
    }
  }

  const sheet = await parseUpload(input.buffer, format);
  if (sheet.truncated) {
    throw new AppError(413, 'TOO_MANY_ROWS', `The file exceeds the supported row count.`);
  }
  if (sheet.rows.length === 0) {
    throw new AppError(422, 'EMPTY_WORKBOOK', 'The workbook contains headers but no data rows.');
  }
  if (sheet.rows.length > env.MAX_IMPORT_ROWS) {
    throw new AppError(413, 'TOO_MANY_ROWS', `The file exceeds the supported row count of ${env.MAX_IMPORT_ROWS}.`);
  }
  if (sheet.headers.filter(Boolean).length > 100) {
    throw new AppError(422, 'TOO_MANY_COLUMNS', 'The worksheet has too many columns.');
  }

  const config = await getAppConfig();
  const overrides = input.columnMapping ?? config.columnMapping;
  const { mapping, resolved, missing } = resolveMapping(sheet.headers, overrides);

  if (missing.length > 0) {
    throw new AppError(
      422,
      'MISSING_COLUMNS',
      'Required columns could not be identified in the worksheet.',
      {
        missing,
        headers: sheet.headers.filter(Boolean).slice(0, 60),
        hint: 'Provide a column mapping or rename the headers to match the configured names.',
      },
    );
  }

  const { candidates, errors, duplicates } = validateRows(sheet, mapping, config.classificationRules, range);

  const existingKeys = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK).map((c) => c.dedupeKey);
    const found = await prisma.sample.findMany({ where: { dedupeKey: { in: chunk } }, select: { dedupeKey: true } });
    for (const row of found) existingKeys.add(row.dedupeKey);
  }

  const accepted: Candidate[] = [];
  const dbDuplicates = new Set<string>();
  for (const candidate of candidates) {
    if (existingKeys.has(candidate.dedupeKey)) {
      if (!dbDuplicates.has(candidate.dedupeKey)) {
        errors.push({
          rowNumber: candidate.rowNumber,
          code: 'DUPLICATE_EXISTING',
          message: 'This sample already exists in another import.',
          rawData: { sampleName: candidate.sampleName, registrationDate: isoDate(candidate.registrationDate) },
        });
        dbDuplicates.add(candidate.dedupeKey);
      }
      continue;
    }
    accepted.push(candidate);
  }

  const duplicateRows = duplicates + dbDuplicates.size;

  if (accepted.length === 0) {
    await recordAudit({
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      action: 'IMPORT_REJECTED',
      entityType: 'MonthlyImport',
      metadata: {
        filename,
        reportingMonth: input.month,
        reportingYear: input.year,
        totalRows: sheet.rows.length,
        errorSummary: errorSummary(errors),
      },
      ip: input.ip,
      requestId: input.requestId,
    });
    throw new AppError(422, 'NO_VALID_ROWS', 'No valid rows were found. Nothing was imported.', {
      totalRows: sheet.rows.length,
      rejectedRows: sheet.rows.length,
      duplicateRows,
      errors: errors.slice(0, 50),
      errorSummary: errorSummary(errors),
    });
  }

  const previewDays = new Map<string, { date: string; total: number; water: number; nonWater: number; unknown: number }>();
  for (const c of accepted) {
    const key = isoDate(c.registrationDate);
    const entry = previewDays.get(key) ?? { date: key, total: 0, water: 0, nonWater: 0, unknown: 0 };
    entry.total += 1;
    if (c.sampleCategory === 'WATER') entry.water += 1;
    else if (c.sampleCategory === 'NON_WATER') entry.nonWater += 1;
    else entry.unknown += 1;
    previewDays.set(key, entry);
  }
  const categories = {
    water: accepted.filter((c) => c.sampleCategory === 'WATER').length,
    nonWater: accepted.filter((c) => c.sampleCategory === 'NON_WATER').length,
    unknown: accepted.filter((c) => c.sampleCategory === 'UNKNOWN').length,
  };

  const created = await prisma.$transaction(
    async (tx) => {
      if (existingMonth) {
        await tx.monthlyImport.update({ where: { id: existingMonth.id }, data: { status: 'REPLACED' } });
        await tx.sample.deleteMany({ where: { importId: existingMonth.id } });
      }

      const record = await tx.monthlyImport.create({
        data: {
          filename,
          fileHash,
          reportingMonth: input.month,
          reportingYear: input.year,
          status: 'COMPLETED',
          totalRows: sheet.rows.length,
          acceptedRows: accepted.length,
          rejectedRows: sheet.rows.length - accepted.length,
          duplicateRows,
          sourceFormat: format,
          columnMapping: JSON.stringify(resolved),
          uploadedById: input.actor.id,
          completedAt: new Date(),
        },
      });

      for (const c of accepted) {
        await tx.sample.create({
          data: {
            dedupeKey: c.dedupeKey,
            sampleIdentifier: c.sampleIdentifier,
            sampleName: c.sampleName,
            registrationDate: c.registrationDate,
            sampleCategory: c.sampleCategory,
            categorySource: c.categorySource,
            importId: record.id,
          },
        });
      }

      for (const e of errors.slice(0, 5000)) {
        await tx.importRowError.create({
          data: {
            importId: record.id,
            rowNumber: e.rowNumber,
            code: e.code,
            message: e.message.slice(0, 500),
            rawData: e.rawData ? JSON.stringify(sanitiseMetadata(e.rawData)).slice(0, 1000) : null,
          },
        });
      }

      await recordAudit(
        {
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: existingMonth ? 'IMPORT_REPLACED' : 'IMPORT_CREATED',
          entityType: 'MonthlyImport',
          entityId: record.id,
          metadata: {
            filename,
            fileHash,
            reportingMonth: input.month,
            reportingYear: input.year,
            totalRows: sheet.rows.length,
            acceptedRows: accepted.length,
            rejectedRows: errors.length,
            duplicateRows,
            replacedImportId: existingMonth?.id ?? null,
            mapping: resolved,
          },
          ip: input.ip,
          requestId: input.requestId,
        },
        tx,
      );

      return record;
    },
    { isolationLevel: 'Serializable', timeout: 60_000 },
  );

  const errorsOut = errors.slice(0, 50).map((e) => ({ rowNumber: e.rowNumber, code: e.code, message: e.message }));

  const full = await getImport(created.id);

  return {
    import: full ?? serialiseImport(created),
    preview: {
      sheetName: sheet.sheetName,
      headers: sheet.headers.filter(Boolean).slice(0, 60),
      detectedMapping: resolved,
      categories,
      dailyCounts: [...previewDays.values()].sort((a, b) => a.date.localeCompare(b.date)),
      errorSummary: errorSummary(errors),
    },
    errors: errorsOut,
  };
}

export async function listImports(page: number, pageSize: number) {
  const where: Prisma.MonthlyImportWhereInput = { status: { not: 'PROCESSING' } };
  const [total, rows] = await Promise.all([
    prisma.monthlyImport.count({ where }),
    prisma.monthlyImport.findMany({
      where,
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { rows: rows.map(serialiseImport), total };
}

export async function getImport(id: string) {
  const row = await prisma.monthlyImport.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { samples: true, rowErrors: true } },
    },
  });
  if (!row) return null;
  return { ...serialiseImport(row), sampleCount: row._count.samples, rowErrorCount: row._count.rowErrors };
}

export async function getImportErrors(id: string) {
  const exists = await prisma.monthlyImport.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  return prisma.importRowError.findMany({ where: { importId: id }, orderBy: { rowNumber: 'asc' }, take: 5000 });
}

export async function rollbackImport(id: string, actor: ImportActor, ip: string | null, requestId: string) {
  const record = await prisma.monthlyImport.findUnique({ where: { id } });
  if (!record) throw new AppError(404, 'NOT_FOUND', 'Import not found.');
  if (record.status === 'REPLACED') throw conflict('ALREADY_REPLACED', 'This import has already been replaced.');

  const dependentMedia = await prisma.mediaPreparation.count({ where: { sample: { importId: id } } });
  const dependentLogs = await prisma.autoclaveLog.count({ where: { sample: { importId: id } } });
  if (dependentMedia > 0 || dependentLogs > 0) {
    throw conflict('ROLLBACK_BLOCKED', 'Media preparation or autoclave records depend on this import.', {
      dependentMedia,
      dependentLogs,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.sample.deleteMany({ where: { importId: id } });
    await tx.monthlyImport.update({ where: { id }, data: { status: 'REPLACED' } });
    await recordAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'IMPORT_ROLLED_BACK',
        entityType: 'MonthlyImport',
        entityId: id,
        metadata: { filename: record.filename, reportingMonth: record.reportingMonth, reportingYear: record.reportingYear },
        ip,
        requestId,
      },
      tx,
    );
  });
}

export { serialiseImport, errorSummary };

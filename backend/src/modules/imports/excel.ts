import ExcelJS from 'exceljs';
import type { SampleCategory } from './types';

export type ParsedRow = { rowNumber: number; cells: unknown[] };
export type ParsedSheet = {
  sheetName: string;
  headers: string[];
  rows: ParsedRow[];
  truncated: boolean;
};

export type ColumnField = 'sampleIdentifier' | 'sampleName' | 'registrationDate' | 'sampleCategory';
export type ColumnMapping = Partial<Record<ColumnField, string | null>>;

const MAX_COLUMNS = 100;
const MAX_ROWS = 100_000;

export const HEADER_ALIASES: Record<ColumnField, string[]> = {
  sampleIdentifier: ['sample id', 'sample identifier', 'sample no', 'sample number', 'sr no', 'sr. no', 'id', 'code'],
  sampleName: ['sample name', 'name of sample', 'sample', 'description', 'particulars', 'test name'],
  registrationDate: ['registration date', 'date of registration', 'reg date', 'sample date', 'date', 'received date'],
  sampleCategory: ['sample category', 'category', 'type', 'sample type', 'water/non-water', 'water / non-water'],
};

function normaliseHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Converts any ExcelJS cell value into a primitive safe to store/validate. */
export function cellToPrimitive(value: ExcelJS.CellValue | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.error) return null;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((part) => (typeof part === 'object' && part && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : ''))
        .join('');
    }
    if (obj.result !== undefined) return cellToPrimitive(obj.result as ExcelJS.CellValue);
    if (typeof obj.hyperlink === 'string') return obj.hyperlink;
  }
  return String(value);
}

function looksLikeCsv(buffer: Buffer): boolean {
  // A CSV cannot contain NUL bytes; an .xlsx is a ZIP archive starting with PK.
  return !buffer.includes(0x00);
}

function decodeText(buffer: Buffer): string {
  let text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) text = buffer.toString('latin1');
  return text.replace(/^\uFEFF/, '');
}

function detectDelimiter(sample: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = sample.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Small RFC-4180 parser: quoted fields, escaped quotes, CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text.slice(0, 8192));
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsFromMatrix(matrix: unknown[][], startRowNumber = 1): ParsedSheet {
  const headerRowIndex = matrix.findIndex((cells) => cells.some((c) => normaliseHeader(c) !== ''));
  if (headerRowIndex === -1) {
    return { sheetName: 'empty', headers: [], rows: [], truncated: false };
  }
  const headerCells = matrix[headerRowIndex].slice(0, MAX_COLUMNS);
  const headers = headerCells.map(normaliseHeader);
  const seen = new Map<string, number>();
  for (let i = 0; i < headers.length; i += 1) {
    if (!headers[i]) continue;
    const count = seen.get(headers[i].toLowerCase()) ?? 0;
    seen.set(headers[i].toLowerCase(), count + 1);
    if (count > 0) headers[i] = `${headers[i]} (${count + 1})`;
  }
  const rows: ParsedRow[] = [];
  let truncated = false;
  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const cells = matrix[r];
    if (!cells || cells.every((c) => normaliseHeader(c) === '')) continue;
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const capped = cells.slice(0, MAX_COLUMNS);
    rows.push({ rowNumber: startRowNumber + r, cells: capped });
  }
  return { sheetName: 'Sheet1', headers, rows, truncated };
}

export async function parseWorkbook(buffer: Buffer, format: 'XLSX' | 'CSV'): Promise<ParsedSheet> {
  if (format === 'CSV') {
    if (!looksLikeCsv(buffer)) {
      throw new Error('CSV_SIGNATURE');
    }
    const text = decodeText(buffer);
    if (text.length > 0 && !/[\n\r,;\t]/.test(text)) {
      // A single-column text file with no delimiter is not a usable table.
      throw new Error('CSV_STRUCTURE');
    }
    const matrix = parseCsv(text);
    const sheet = rowsFromMatrix(matrix);
    return { ...sheet, sheetName: 'CSV' };
  }

  // XLSX is a ZIP archive. Verify the signature before handing to the parser.
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error('XLSX_SIGNATURE');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  let chosen: ExcelJS.Worksheet | undefined;
  for (const sheet of workbook.worksheets) {
    if (sheet && sheet.rowCount > 1) {
      chosen = sheet;
      break;
    }
  }
  chosen = chosen ?? workbook.worksheets[0];
  if (!chosen) throw new Error('EMPTY_WORKBOOK');

  const matrix: unknown[][] = [];
  chosen.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellToPrimitive(cell.value);
    });
    matrix.push(cells);
  });

  const parsed = rowsFromMatrix(matrix);
  return { ...parsed, sheetName: chosen.name || 'Sheet1' };
}

/**
 * Resolves the mapping between spreadsheet headers and logical fields.
 * Explicit overrides win; otherwise alias matching is used. No guessing beyond
 * the documented alias list, and the resolved mapping is returned for audit.
 */
export function resolveMapping(
  headers: string[],
  overrides: ColumnMapping = {},
): { mapping: Record<ColumnField, number | null>; resolved: ColumnMapping; missing: ColumnField[] } {
  const mapping: Record<ColumnField, number | null> = {
    sampleIdentifier: null,
    sampleName: null,
    registrationDate: null,
    sampleCategory: null,
  };
  const resolved: ColumnMapping = {};
  const lower = headers.map((h) => h.trim().toLowerCase());

  const fields: ColumnField[] = ['sampleIdentifier', 'sampleName', 'registrationDate', 'sampleCategory'];
  for (const field of fields) {
    const override = overrides[field];
    if (override) {
      const idx = lower.indexOf(override.trim().toLowerCase());
      mapping[field] = idx === -1 ? null : idx;
      if (idx !== -1) resolved[field] = headers[idx];
      continue;
    }
    const idx = headers.findIndex((_, i) => HEADER_ALIASES[field].includes(lower[i]));
    if (idx !== -1) {
      mapping[field] = idx;
      resolved[field] = headers[idx];
    }
  }

  const missing: ColumnField[] = [];
  if (mapping.sampleName === null) missing.push('sampleName');
  if (mapping.registrationDate === null) missing.push('registrationDate');

  return { mapping, resolved, missing };
}

const CATEGORY_VALUES: Record<string, SampleCategory> = {
  water: 'WATER',
  w: 'WATER',
  'water sample': 'WATER',
  'drinking water': 'WATER',
  nonwater: 'NON_WATER',
  'non-water': 'NON_WATER',
  'non water': 'NON_WATER',
  'non_water': 'NON_WATER',
  nw: 'NON_WATER',
  'non water sample': 'NON_WATER',
  other: 'NON_WATER',
  product: 'NON_WATER',
  swab: 'NON_WATER',
};

export function normaliseCategory(value: unknown): SampleCategory | null {
  if (value === null || value === undefined) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  if (CATEGORY_VALUES[key]) return CATEGORY_VALUES[key];
  if (/\bnon[\s_-]*water\b/.test(key)) return 'NON_WATER';
  if (/\bwater\b/.test(key)) return 'WATER';
  return null;
}

export type ClassificationRule = { match: string; category: 'WATER' | 'NON_WATER' };

/** Rules are admin-defined: plain case-insensitive substring or /regex/flags. */
export function classifyByRules(sampleName: string, rules: ClassificationRule[]): SampleCategory | null {
  for (const rule of rules) {
    if (!rule || typeof rule.match !== 'string' || !rule.match.trim()) continue;
    const category = rule.category === 'WATER' ? 'WATER' : rule.category === 'NON_WATER' ? 'NON_WATER' : null;
    if (!category) continue;
    const raw = rule.match.trim();
    if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
      const end = raw.lastIndexOf('/');
      const pattern = raw.slice(1, end);
      const flags = raw.slice(end + 1).replace(/[^gimsuy]/g, '');
      try {
        if (new RegExp(pattern, flags.includes('i') ? flags : `${flags}i`).test(sampleName)) return category;
      } catch {
        // Invalid admin regex: ignore this rule rather than crash imports.
      }
    } else if (sampleName.toLowerCase().includes(raw.toLowerCase())) {
      return category;
    }
  }
  return null;
}

/**
 * Spreadsheet formula-injection protection (OWASP CSV injection).
 * Any cell whose text could be interpreted as a formula when the export is
 * opened in Excel/LibreOffice/Sheets is prefixed with a single quote.
 */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function spreadsheetSafe(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  let text = String(value);
  // Strip control characters (except tab/newline which are escaped by writers).
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  if (text.length > 32767) text = text.slice(0, 32767);
  if (DANGEROUS_PREFIX.test(text)) text = `'${text}`;
  return text;
}

export function csvCell(value: unknown): string {
  const safe = spreadsheetSafe(value);
  if (safe === null) return '';
  const text = String(safe);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Removes keys that must never reach the audit log. */
const SECRET_KEY = /pass(word)?|secret|token|cookie|authorization|csrf|hash|pepper|api[-_]?key/i;

export function sanitiseMetadata(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return input.length > 500 ? `${input.slice(0, 500)}...` : input;
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => sanitiseMetadata(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : sanitiseMetadata(value, depth + 1);
    }
    return out;
  }
  return String(input);
}

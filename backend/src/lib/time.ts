/** All dates are handled in UTC to keep reporting months stable across timezones. */

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function timeToMinutes(value: string): number {
  const m = TIME_PATTERN.exec(value);
  if (!m) throw new Error('Invalid time');
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** End time = start + duration, wrapping correctly across midnight. */
export function addMinutesToTime(time: string, durationMinutes: number): string {
  return minutesToTime(timeToMinutes(time) + durationMinutes);
}

export function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const d = startOfUtcDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function utcDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthName(month: number): string {
  return (
    [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ][month - 1] ?? 'Unknown'
  );
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidMonthYear(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

/**
 * Parses the date formats the laboratory spreadsheet may contain. Returns null
 * for anything ambiguous - the caller must reject the row, never guess.
 */
export function parseLooseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfUtcDay(new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (1900 date system), sanity-bounded to 1990-2100.
    if (value < 32874 || value > 73415) return null;
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : startOfUtcDay(d);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
  }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (m) {
    // Explicitly day-first (the laboratory's convention); month-first would be
    // ambiguous for dates like 07/09/2026, so it is not silently accepted.
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[1]) ? d : null;
  }
  m = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{4})$/.exec(trimmed);
  if (m) {
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const idx = months.findIndex((name) => name.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (idx === -1) return null;
    const d = new Date(Date.UTC(Number(m[3]), idx, Number(m[1])));
    return d.getUTCMonth() === idx && d.getUTCDate() === Number(m[1]) ? d : null;
  }
  return null;
}

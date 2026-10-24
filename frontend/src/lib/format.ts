const MONTH_NAMES = [
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
];

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

export function formatMonthYear(month: number, year: number): string {
  const name = monthName(month);
  return name ? `${name} ${year}` : `${month}/${year}`;
}

export function monthOptions(): { value: number; label: string }[] {
  return MONTH_NAMES.map((label, index) => ({ value: index + 1, label }));
}

export function currentPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/** Parses the time part of `"HH:mm"` or `"YYYY-MM-DDTHH:mm"`. */
function parseTimeParts(value: string): { hours: number; minutes: number } | null {
  const match = /(?:^|T)(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** Converts a 24-hour `"HH:mm"` string to a 12-hour display string. */
export function formatTime12h(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = parseTimeParts(value);
  if (!parts) return value;
  const suffix = parts.hours >= 12 ? 'PM' : 'AM';
  const hour12 = parts.hours % 12 === 0 ? 12 : parts.hours % 12;
  return `${hour12}:${String(parts.minutes).padStart(2, '0')} ${suffix}`;
}

/** Converts `"HH:mm"` to the value used by `<input type="time">`. */
export function toTimeInputValue(value: string | null | undefined): string {
  const parts = value ? parseTimeParts(value) : null;
  if (!parts) return '';
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`;
}

/**
 * Adds minutes to a 24-hour `"HH:mm"` time. Wraps across midnight and returns
 * `"HH:mm"`.
 */
export function addMinutesToTime(value: string, minutes: number): string {
  const parts = parseTimeParts(value);
  if (!parts || !Number.isFinite(minutes)) return value;
  const total = (parts.hours * 60 + parts.minutes + Math.trunc(minutes)) % (24 * 60);
  const normalized = total < 0 ? total + 24 * 60 : total;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** End time = sterilization start + duration, wrapping across midnight. */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  return addMinutesToTime(startTime, durationMinutes);
}

function toDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value) return null;
  // Date-only strings are treated as local calendar dates so a date does not
  // shift backwards for users west of UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Formats a date as `1 Sep 2026` (local calendar date). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  if (!date) return typeof value === 'string' ? value : '—';
  return `${date.getDate()} ${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Formats an ISO timestamp as `1 Sep 2026, 11:00 AM`. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = toDate(value);
  if (!date) return typeof value === 'string' ? value : '—';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)}, ${formatTime12h(`${hours}:${minutes}`)}`;
}

/** Today's local date as `YYYY-MM-DD`. */
export function todayISO(): string {
  return toDateInputValue(new Date());
}

export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = toDate(value);
  if (!date) return typeof value === 'string' ? value : '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A local `datetime-local` value, e.g. `2026-09-01T11:00`. */
export function toDateTimeLocalValue(value: Date = new Date()): string {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${toDateInputValue(value)}T${hours}:${minutes}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const rounded = size >= 10 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded} ${units[index]}`;
}

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return numberFormatter.format(value);
}

export function formatQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (quantity === null || quantity === undefined) return '—';
  return `${formatNumber(quantity)}${unit ? ` ${unit}` : ''}`;
}

/** Turns `SAMPLE_CREATED` / `sample.created` into `Sample created`. */
export function humanizeAction(action: string): string {
  if (!action) return 'Activity';
  const spaced = action
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Difference in whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const first = toDate(a);
  const second = toDate(b);
  if (!first || !second) return 0;
  return Math.round((second.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
}

export function addDaysISO(value: string, days: number): string {
  const date = toDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

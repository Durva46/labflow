import { prisma } from '../../lib/prisma';
import { addUtcDays, isoDate, monthRange, startOfUtcDay } from '../../lib/time';
import { getAutoclaveSettings } from '../settings/service';
import type { CleaningStatus } from '../imports/types';

/**
 * Reproduces the configured example schedule: anchor date, then a first
 * interval (6 days in the September example), then repeating interval (7 days).
 * Works for any month length and does not depend on the anchor being in the
 * requested month.
 */
export function cleaningDatesForMonth(
  anchor: Date,
  firstIntervalDays: number,
  intervalDays: number,
  year: number,
  month: number,
): Date[] {
  const { start, end } = monthRange(year, month);
  const dates: Date[] = [];
  let cursor = startOfUtcDay(anchor);
  let step = Math.max(1, firstIntervalDays);
  const repeat = Math.max(1, intervalDays);
  let guard = 0;

  while (cursor < end && guard < 5000) {
    if (cursor >= start) dates.push(new Date(cursor));
    cursor = addUtcDays(cursor, step);
    step = repeat;
    guard += 1;
  }
  return dates;
}

export function deriveCleaningStatus(scheduledDate: Date, completedAt: Date | null, today = new Date()): CleaningStatus {
  if (completedAt) return 'COMPLETED';
  return startOfUtcDay(scheduledDate).getTime() < startOfUtcDay(today).getTime() ? 'OVERDUE' : 'PENDING';
}

export async function generateCleaningSchedule(month: number, year: number) {
  const settings = await getAutoclaveSettings();
  const dates = cleaningDatesForMonth(
    settings.cleaningAnchorDate,
    settings.cleaningFirstIntervalDays,
    settings.cleaningIntervalDays,
    year,
    month,
  );

  let created = 0;
  let skipped = 0;
  for (const date of dates) {
    const existing = await prisma.autoclaveCleaning.findUnique({ where: { scheduledDate: date }, select: { id: true } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.autoclaveCleaning.create({ data: { scheduledDate: date, status: 'PENDING' } });
    created += 1;
  }
  return { created, skipped, dates: dates.map(isoDate) };
}

export async function listCleaning(month: number, year: number) {
  const { start, end } = monthRange(year, month);
  const rows = await prisma.autoclaveCleaning.findMany({
    where: { scheduledDate: { gte: start, lt: end } },
    include: { responsible: { select: { id: true, name: true } } },
    orderBy: { scheduledDate: 'asc' },
  });
  const today = new Date();
  return rows.map((row) => ({
    id: row.id,
    scheduledDate: row.scheduledDate,
    completedAt: row.completedAt,
    status: deriveCleaningStatus(row.scheduledDate, row.completedAt, today),
    responsibleUser: row.responsible ? { id: row.responsible.id, name: row.responsible.name } : null,
    responsibleUserId: row.responsibleUserId,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export type CleaningMonthSummary = {
  scheduled: number;
  completed: number;
  pending: number;
  overdue: number;
  nextDue: string | null;
};

export function summariseCleaning(
  rows: Array<{ scheduledDate: Date; completedAt: Date | null }>,
  today = new Date(),
): CleaningMonthSummary {
  let completed = 0;
  let pending = 0;
  let overdue = 0;
  let nextDue: Date | null = null;
  const todayStart = startOfUtcDay(today);

  for (const row of rows) {
    const status = deriveCleaningStatus(row.scheduledDate, row.completedAt, today);
    if (status === 'COMPLETED') completed += 1;
    else if (status === 'OVERDUE') overdue += 1;
    else {
      pending += 1;
      if (!nextDue || row.scheduledDate < nextDue) nextDue = row.scheduledDate;
    }
  }

  // nextDue also considers today's scheduled cleaning if it is still pending.
  if (!nextDue) {
    const upcoming = rows
      .filter((r) => !r.completedAt && r.scheduledDate >= todayStart)
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())[0];
    if (upcoming) nextDue = upcoming.scheduledDate;
  }

  return { scheduled: rows.length, completed, pending, overdue, nextDue: nextDue ? isoDate(nextDue) : null };
}

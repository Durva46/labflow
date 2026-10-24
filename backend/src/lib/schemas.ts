import { z } from 'zod';
import { isValidMonthYear } from '../lib/time';

export const idParam = z.object({ id: z.string().min(1).max(64) });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const monthYearQuery = z
  .object({
    month: z.coerce.number().int(),
    year: z.coerce.number().int(),
  })
  .refine((v) => isValidMonthYear(v.year, v.month), {
    message: 'month must be 1-12 and year must be between 2000 and 2100',
    path: ['month'],
  });

export const optionalMonthYearQuery = z
  .object({
    month: z.coerce.number().int().optional(),
    year: z.coerce.number().int().optional(),
  })
  .transform((v) => {
    const now = new Date();
    const month = v.month ?? now.getUTCMonth() + 1;
    const year = v.year ?? now.getUTCFullYear();
    return { month, year };
  })
  .refine((v) => isValidMonthYear(v.year, v.month), {
    message: 'month must be 1-12 and year must be between 2000 and 2100',
    path: ['month'],
  });

export const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use 24-hour HH:mm format');

export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), 'Invalid date');

export const paginationMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

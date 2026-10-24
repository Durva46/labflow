import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];
for (const file of candidates) {
  if (fs.existsSync(file)) dotenv.config({ path: file });
}

const csv = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const intish = (min: number, max: number, fallback: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intish(1, 65535, 4000),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default(''),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().default(''),
  PASSWORD_PEPPER: z.string().default(''),
  SESSION_TTL_MINUTES: intish(5, 7 * 24 * 60, 480),
  SESSION_ABSOLUTE_TTL_MINUTES: intish(5, 30 * 24 * 60, 1440),
  LOGIN_MAX_ATTEMPTS: intish(3, 20, 5),
  LOGIN_LOCKOUT_MINUTES: intish(1, 1440, 15),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: intish(1, 1440, 15),
  LOGIN_RATE_LIMIT_MAX: intish(1, 10000, 10),
  GLOBAL_RATE_LIMIT_MAX: intish(10, 1000000, 600),
  MAX_UPLOAD_BYTES: intish(1024, 50 * 1024 * 1024, 10 * 1024 * 1024),
  MAX_IMPORT_ROWS: intish(10, 200000, 20000),
  ALLOW_DEMO_SEED: boolish.default(false),
  DEMO_ADMIN_EMAIL: z.string().default('admin@labflow.local'),
  DEMO_ADMIN_PASSWORD: z.string().default(''),
  DEMO_MANAGER_PASSWORD: z.string().default(''),
  DEMO_STAFF_PASSWORD: z.string().default(''),
  TRUST_PROXY: boolish.default(false),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Never echo values, only the names of invalid/missing variables.
  const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  // eslint-disable-next-line no-console
  console.error(`[config] Invalid or missing environment variables: ${fields}`);
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';

const productionProblems: string[] = [];
if (isProduction) {
  if (!raw.SESSION_SECRET || raw.SESSION_SECRET.length < 32) {
    productionProblems.push('SESSION_SECRET must be at least 32 characters');
  }
  if (!raw.PASSWORD_PEPPER || raw.PASSWORD_PEPPER.length < 16) {
    productionProblems.push('PASSWORD_PEPPER must be at least 16 characters');
  }
  if (raw.ALLOW_DEMO_SEED) {
    productionProblems.push('ALLOW_DEMO_SEED must not be enabled in production');
  }
  if (!/^postgres(ql)?:\/\//.test(raw.DATABASE_URL)) {
    productionProblems.push('DATABASE_URL must be a PostgreSQL connection string in production');
  }
  const origins = csv(raw.CORS_ORIGINS);
  if (origins.length === 0) productionProblems.push('CORS_ORIGINS must list the production frontend origin(s)');
  if (origins.some((o) => o === '*' || !/^https:\/\//.test(o))) {
    productionProblems.push('CORS_ORIGINS must contain explicit https:// origins (no wildcards, no http)');
  }
  if (raw.TRUST_PROXY === false) {
    productionProblems.push('TRUST_PROXY must be enabled (1) when served behind a production reverse proxy');
  }
}

if (productionProblems.length > 0) {
  // Fail closed: do not start a production server with insecure defaults.
  // eslint-disable-next-line no-console
  console.error(`[config] Refusing to start in production:\n - ${productionProblems.join('\n - ')}`);
  process.exit(1);
}

const devSecret = 'dev-only-insecure-session-secret-do-not-use-in-production';
const devPepper = 'dev-only-insecure-pepper';

export const env = {
  ...raw,
  CORS_ORIGINS_LIST: csv(raw.CORS_ORIGINS),
  SESSION_SECRET: raw.SESSION_SECRET || devSecret,
  PASSWORD_PEPPER: raw.PASSWORD_PEPPER || devPepper,
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  isDevelopment: raw.NODE_ENV === 'development',
  demoSeedAllowed: raw.ALLOW_DEMO_SEED && raw.NODE_ENV !== 'production',
};

export type Env = typeof env;

if (!env.isProduction && (!raw.SESSION_SECRET || !raw.PASSWORD_PEPPER)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] Using development-only session secret / password pepper. ' +
      'Set SESSION_SECRET and PASSWORD_PEPPER before deploying.',
  );
}

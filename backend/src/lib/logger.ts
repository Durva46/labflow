import crypto from 'node:crypto';
import { env } from '../config/env';

const SENSITIVE_KEY = /pass(word)?|secret|token|cookie|authorization|csrf|hash|pepper|api[-_]?key/i;

type Level = 'debug' | 'info' | 'warn' | 'error';

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (env.isTest && level !== 'error') return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

export const newRequestId = () => crypto.randomUUID();

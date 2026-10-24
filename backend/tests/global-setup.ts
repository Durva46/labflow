import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(__dirname, '..');

function walk(dir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

export default async function globalSetup() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-for-production-0123456789';
  process.env.PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || 'test-pepper-not-for-production';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.ALLOW_DEMO_SEED = 'false';
  process.env.LOGIN_RATE_LIMIT_MAX = '1000';
  process.env.GLOBAL_RATE_LIMIT_MAX = '100000';

  // Ensure the sqlite schema is generated before tests run.
  try {
    const { execSync } = require('node:child_process');
    execSync('node ../scripts/use-sqlite.cjs', { stdio: 'pipe', cwd: root });
    execSync('prisma generate --schema prisma/schema.dev.prisma', { stdio: 'pipe', cwd: root });
    execSync('prisma db push --schema prisma/schema.dev.prisma --force-reset', { stdio: 'pipe', cwd: root });
  } catch (e) {
    // Tests that need the DB will fail with a clearer error; do not block import.
  }
}

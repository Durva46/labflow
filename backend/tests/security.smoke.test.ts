import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const app = createApp();

async function getCsrf(agent: request.SuperTest<request.Test>) {
  const res = await agent.get('/api/v1/auth/csrf');
  const set = res.headers['set-cookie'];
  const cookie = Array.isArray(set) ? set.find((c: string) => c.startsWith('lf_csrf=')) : set;
  if (typeof cookie !== 'string') throw new Error('no csrf cookie');
  return cookie.split(';')[0].split('=')[1];
}

describe('security smoke', () => {
  beforeAll(async () => {
    // prepare sqlite test db
    process.chdir(path.resolve(__dirname, '..'));
    try {
      execSync('node ../scripts/use-sqlite.cjs', { stdio: 'inherit' });
    } catch {}
    try {
      execSync('prisma generate --schema prisma/schema.dev.prisma', { stdio: 'inherit' });
    } catch {}
    try {
      execSync('prisma db push --schema prisma/schema.dev.prisma --force-reset', { stdio: 'inherit' });
    } catch {}
  });

  afterAll(async () => {
    await prisma.$disconnect();
    try {
      fs.unlinkSync(path.resolve(__dirname, '../test.db'));
    } catch {}
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    const res = await request(app).get('/api/v1/users');
    expect([401, 403]).toContain(res.status);
    expect(res.body?.error?.code).toBeTruthy();
  });

  it('rate limits login attempts', async () => {
    const agent = request.agent(app);
    const csrf = await getCsrf(agent);
    for (let i = 0; i < 12; i += 1) {
      await agent
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', csrf)
        .send({ email: `nobody${i}@example.com`, password: 'WrongPassword123!' });
    }
    const res = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'nobody@example.com', password: 'WrongPassword123!' });
    expect(res.status).toBe(429);
    expect(res.body?.error?.code).toBe('RATE_LIMITED');
  });

  it('rejects missing CSRF on mutating requests when authenticated context would be used', async () => {
    const agent = request.agent(app);
    const csrf = await getCsrf(agent);
    // login without csrf header -> should be rejected by CSRF middleware
    const res = await agent.post('/api/v1/auth/login').send({ email: 'x@y.com', password: 'aaaaaaaaaaaa' });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('CSRF_FAILED');
  });

  it('does not use $queryRawUnsafe', async () => {
    const files = [
      path.resolve(__dirname, '../src'),
      path.resolve(__dirname, '../tests'),
    ];
    const bad = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (full.endsWith('.ts') || full.endsWith('.js')) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('$queryRawUnsafe') || content.includes('$executeRawUnsafe')) bad.push(full);
        }
      }
    }
    for (const f of files) walk(f);
    expect(bad).toEqual([]);
  });

  it('returns generic errors without stack traces in production shape', async () => {
    const res = await request(app).get('/api/v1/does-not-exist-xyz');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/stack/);
  });
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      SESSION_SECRET: 'test-session-secret-not-for-production-0123456789',
      PASSWORD_PEPPER: 'test-pepper-not-for-production',
      CORS_ORIGINS: 'http://localhost:5173',
      ALLOW_DEMO_SEED: 'false',
      LOGIN_MAX_ATTEMPTS: '5',
      LOGIN_LOCKOUT_MINUTES: '15',
      LOGIN_RATE_LIMIT_MAX: '1000',
      GLOBAL_RATE_LIMIT_MAX: '100000',
      MAX_UPLOAD_BYTES: '10485760',
    },
  },
});

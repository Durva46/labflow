import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { newRequestId } from './lib/logger';
import { loadSession } from './middleware/auth';
import { csrfProtection, ensureCsrfCookie, originCheck } from './middleware/csrf';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler, requestContext } from './middleware/errorHandler';
import { asyncHandler } from './middleware/asyncHandler';
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import importRoutes from './modules/imports/routes';
import sampleRoutes from './modules/samples/routes';
import mediaRoutes from './modules/media/routes';
import autoclaveRoutes from './modules/autoclave/routes';
import dashboardRoutes from './modules/dashboard/routes';
import reportRoutes from './modules/reports/routes';
import settingsRoutes from './modules/settings/routes';
import auditRoutes from './modules/audit/routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: env.isProduction,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS_LIST.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(globalLimiter);

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', uptime: process.uptime(), version: '0.1.0' });
    }),
  );

  app.use(ensureCsrfCookie);
  app.use(loadSession);
  app.use(originCheck);
  app.use(csrfProtection);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/imports', importRoutes);
  app.use('/api/v1/samples', sampleRoutes);
  app.use('/api/v1/media-preparation', mediaRoutes);
  app.use('/api/v1', autoclaveRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/audit', auditRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { newRequestId };

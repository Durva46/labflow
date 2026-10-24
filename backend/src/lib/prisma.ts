import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Single Prisma client per process. All queries go through the ORM (parameterised).
 * Raw SQL is only permitted via `$queryRaw` / `$executeRaw` tagged templates.
 */
export const prisma = new PrismaClient({
  log: env.isDevelopment ? ['warn', 'error'] : ['error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

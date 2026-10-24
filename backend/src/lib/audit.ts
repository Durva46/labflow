import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { sanitiseMetadata } from './sanitize';
import { logger } from './logger';

type Tx = Prisma.TransactionClient | typeof prisma;

export type AuditInput = {
  actorId?: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  requestId?: string | null;
};

/**
 * Append-only audit trail. There is deliberately no update/delete helper.
 * Secrets are stripped before serialisation; the write never fails the caller's
 * business transaction silently - it is awaited inside the same transaction.
 */
export async function recordAudit(input: AuditInput, tx: Tx = prisma): Promise<void> {
  try {
    const safe = input.metadata ? JSON.stringify(sanitiseMetadata(input.metadata)) : null;
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail.slice(0, 200),
        action: input.action.slice(0, 100),
        entityType: input.entityType.slice(0, 60),
        entityId: input.entityId ?? null,
        metadata: safe && safe.length > 4000 ? safe.slice(0, 4000) : safe,
        ip: input.ip ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (error) {
    // Auditing must not be silently skipped; log without sensitive payloads.
    logger.error('audit write failed', {
      action: input.action,
      entityType: input.entityType,
      error: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

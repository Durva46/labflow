import { prisma } from '../../lib/prisma';
import { sanitiseMetadata } from '../../lib/sanitize';
import { userSelect } from '../users/serialise';
import type { ClassificationRule, ColumnMapping } from '../imports/excel';

export type AppConfig = {
  columnMapping: ColumnMapping;
  classificationRules: ClassificationRule[];
  retentionDays: number;
};

const DEFAULTS: AppConfig = {
  columnMapping: {},
  classificationRules: [],
  retentionDays: 2555, // 7 years
};

async function readKey(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getAppConfig(): Promise<AppConfig> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ['columnMapping', 'classificationRules', 'retentionDays'] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const config: AppConfig = { ...DEFAULTS, columnMapping: {}, classificationRules: [] };

  const mappingRaw = map.get('columnMapping');
  if (mappingRaw) {
    try {
      const parsed = sanitiseMetadata(JSON.parse(mappingRaw)) as Record<string, unknown>;
      config.columnMapping = {
        sampleIdentifier: typeof parsed.sampleIdentifier === 'string' ? parsed.sampleIdentifier : null,
        sampleName: typeof parsed.sampleName === 'string' ? parsed.sampleName : null,
        registrationDate: typeof parsed.registrationDate === 'string' ? parsed.registrationDate : null,
        sampleCategory: typeof parsed.sampleCategory === 'string' ? parsed.sampleCategory : null,
      };
    } catch {
      config.columnMapping = {};
    }
  }

  const rulesRaw = map.get('classificationRules');
  if (rulesRaw) {
    try {
      const parsed = JSON.parse(rulesRaw) as unknown;
      if (Array.isArray(parsed)) {
        config.classificationRules = parsed
          .filter(
            (r): r is ClassificationRule =>
              !!r &&
              typeof r === 'object' &&
              typeof (r as ClassificationRule).match === 'string' &&
              ((r as ClassificationRule).category === 'WATER' || (r as ClassificationRule).category === 'NON_WATER'),
          )
          .slice(0, 100)
          .map((r) => ({ match: r.match.slice(0, 200), category: r.category }));
      }
    } catch {
      config.classificationRules = [];
    }
  }

  const retention = Number(map.get('retentionDays'));
  if (Number.isFinite(retention) && retention >= 30 && retention <= 36500) config.retentionDays = retention;

  return config;
}

export async function saveAppConfig(patch: Partial<AppConfig>): Promise<void> {
  const upserts: Promise<unknown>[] = [];
  if (patch.columnMapping !== undefined) {
    upserts.push(
      prisma.appSetting.upsert({
        where: { key: 'columnMapping' },
        create: { key: 'columnMapping', value: JSON.stringify(patch.columnMapping) },
        update: { value: JSON.stringify(patch.columnMapping) },
      }),
    );
  }
  if (patch.classificationRules !== undefined) {
    upserts.push(
      prisma.appSetting.upsert({
        where: { key: 'classificationRules' },
        create: { key: 'classificationRules', value: JSON.stringify(patch.classificationRules) },
        update: { value: JSON.stringify(patch.classificationRules) },
      }),
    );
  }
  if (patch.retentionDays !== undefined) {
    upserts.push(
      prisma.appSetting.upsert({
        where: { key: 'retentionDays' },
        create: { key: 'retentionDays', value: String(patch.retentionDays) },
        update: { value: String(patch.retentionDays) },
      }),
    );
  }
  await Promise.all(upserts);
}

export async function getAutoclaveSettings() {
  const existing = await prisma.autoclaveSettings.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.autoclaveSettings.create({
    data: { id: 'singleton', cleaningAnchorDate: new Date(Date.UTC(new Date().getUTCFullYear(), 8, 1)) },
  });
}

export const settingsInclude = { uploadedBy: { select: userSelect } } as const;

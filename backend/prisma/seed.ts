import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function prehash(pepper: string, password: string) {
  return crypto.createHash('sha256').update(pepper).update('\u0000').update(password, 'utf8').digest('hex');
}

async function main() {
  const env = process.env;
  if (env.NODE_ENV === 'production' || env.ALLOW_DEMO_SEED !== 'true') {
    console.log('[seed] demo seeding disabled (not enabled or production).');
    process.exit(0);
  }
  const pepper = env.PASSWORD_PEPPER || 'dev-only-insecure-pepper';
  const cost = 4;

  const adminEmail = env.DEMO_ADMIN_EMAIL || 'admin@labflow.local';
  const adminPass = env.DEMO_ADMIN_PASSWORD || 'LabflowAdmin!2026';
  const mgrPass = env.DEMO_MANAGER_PASSWORD || 'LabflowMgr!2026';
  const staffPass = env.DEMO_STAFF_PASSWORD || 'LabflowStaff!2026';

  const users = [
    { email: adminEmail, name: 'Lab Administrator', role: 'ADMIN', password: adminPass },
    { email: 'manager@labflow.local', name: 'Lab Manager', role: 'LAB_MANAGER', password: mgrPass },
    { email: 'staff@labflow.local', name: 'Lab Staff', role: 'LAB_STAFF', password: staffPass },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(prehash(pepper, u.password), cost);
    await prisma.user.upsert({
      where: { email: u.email },
      create: { name: u.name, email: u.email, passwordHash: hash, role: u.role, isActive: true, mustChangePassword: true },
      update: { name: u.name, role: u.role, isActive: true, mustChangePassword: true },
    });
  }

  await prisma.autoclaveSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });

  console.log('[seed] demo users created/updated (mustChangePassword=true). Do not use in production.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

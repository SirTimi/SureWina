// Dev seed: one OPERATOR, one COMPLIANCE_OFFICER, one FINANCE_OFFICER. Idempotent.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const ADMINS = [
  { email: 'admin@surewina.local', fullName: 'Dev Operator', role: 'OPERATOR', password: 'SureWina#Dev2026', tier: 'SUPER' },
  { email: 'compliance@surewina.local', fullName: 'Dev Compliance', role: 'COMPLIANCE_OFFICER', password: 'SureWina#Comp2026', tier: 'INTERMEDIATE' },
  { email: 'finance@surewina.local', fullName: 'Dev Finance', role: 'FINANCE_OFFICER', password: 'SureWina#Fin2026', tier: 'INTERMEDIATE' },
];

async function main() {
  const prisma = new PrismaClient();
  for (const a of ADMINS) {
    const passwordHash = await bcrypt.hash(a.password, 12);
    await prisma.adminUser.upsert({
      where: { email: a.email },
      create: { email: a.email, fullName: a.fullName, passwordHash, role: a.role, isActive: true, mfaEnabled: false, tier: a.tier },
      update: { passwordHash, isActive: true, mfaEnabled: false, failedAttempts: 0, lockedUntil: null, tier: a.tier },

    });
    console.log(`Admin ready: ${a.email} (${a.role})  password: ${a.password}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
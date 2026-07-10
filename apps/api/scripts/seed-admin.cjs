// One-off dev seed: creates (or resets) an OPERATOR admin.
// Usage:  node scripts/seed-admin.cjs
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const EMAIL = 'admin@surewina.local';
const PASSWORD = 'SureWina#Dev2026';
const FULL_NAME = 'Dev Operator';

async function main() {
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      fullName: FULL_NAME,
      passwordHash,
      role: 'OPERATOR',
      isActive: true,
      mfaEnabled: false,
    },
    update: {
      // Re-running resets the password and clears any lockout.
      passwordHash,
      isActive: true,
      mfaEnabled: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`Admin ready: ${admin.email} (${admin.role})`);
  console.log(`Password:    ${PASSWORD}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
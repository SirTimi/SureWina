import { AdminRole, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL?.toLowerCase().trim() || 'admin@surewina.local';
  const password = process.env.ADMIN_SEED_PASSWORD || 'AdminPass123!';
  const fullName = process.env.ADMIN_SEED_FULL_NAME || 'Surewina Admin';

  if (password.length < 12) {
    throw new Error('ADMIN_SEED_PASSWORD must be at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: {
      email,
    },
    create: {
      email,
      fullName,
      passwordHash,
      role: AdminRole.OPERATOR,
      isActive: true,
      mfaEnabled: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
    update: {
      fullName,
      passwordHash,
      role: AdminRole.OPERATOR,
      isActive: true,
      mfaEnabled: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`Seeded admin user: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
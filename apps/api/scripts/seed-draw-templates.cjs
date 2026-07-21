const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // The first admin becomes the nominal author/approver of the initial config.
  const admin = await prisma.adminUser.findFirst({
    where: { role: 'OPERATOR' },
    select: { adminUserId: true, email: true },
  });
  if (!admin) throw new Error('No OPERATOR admin found — run seed-admin first');

  const now = new Date();

  const templates = [
    {
      templateType: 'DAILY_STANDARD',
      label: 'Daily draw — standard',
      prizeDescription: 'Daily Surewina draw prize',
      prizeValueNgn: 500000,
      ticketPriceNgn: 500,
      ticketQuota: null,
      cutoffMinutesWat: 19 * 60,     // 19:00 WAT
      scheduledMinutesWat: 20 * 60,  // 20:00 WAT
      weekdays: [0, 1, 2, 3, 4, 5],  // Sun–Fri; Saturday is jackpot-only
    },
    {
      templateType: 'SATURDAY_JACKPOT',
      label: 'Saturday jackpot',
      prizeDescription: 'Saturday jackpot',
      prizeValueNgn: 4000000,
      ticketPriceNgn: 5000,
      ticketQuota: null,
      cutoffMinutesWat: 20 * 60,     // 20:00 WAT
      scheduledMinutesWat: 21 * 60,  // 21:00 WAT
      weekdays: [6],                 // Saturday only
    },
  ];

  for (const t of templates) {
    const existing = await prisma.drawTemplate.findFirst({
      where: { templateType: t.templateType, status: 'ACTIVE' },
    });
    if (existing) {
      console.log(`ACTIVE ${t.templateType} template already exists — skipping`);
      continue;
    }

    const created = await prisma.drawTemplate.create({
      data: {
        ...t,
        version: 1,
        status: 'ACTIVE',
        effectiveFrom: now,
        createdByAdminId: admin.adminUserId,
        approvedByAdminId: admin.adminUserId,
        approvedAt: now,
      },
    });
    console.log(`Seeded ${t.templateType} template v1 (${created.templateId})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
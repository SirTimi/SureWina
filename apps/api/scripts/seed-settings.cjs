const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SETTINGS = [
  { key: 'WHT_RATE_PERCENT', value: '5', description: 'Withholding tax rate on cash prizes (%). Confirm with tax advisor.' },
  { key: 'WHT_THRESHOLD_NGN', value: '0', description: 'Gross prize at/above which WHT applies (₦). 0 = all cash prizes.' },
  { key: 'LEVY_RATE_PERCENT', value: '2.5', description: 'State Games Management Board levy on sales (%). PROVISIONAL.' },
  { key: 'AGENT_PAYOUT_MAX_NGN', value: '50000', description: 'Largest prize an agent may pay in cash (₦).' },
];

async function main() {
  for (const s of SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {}, // never overwrite an existing value
      create: s,
    });
    console.log(`Ensured ${s.key}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
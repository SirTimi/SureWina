// Dev seed: one ACTIVE agent matching the frontend mock. Idempotent.
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

async function main() {
  const prisma = new PrismaClient();
  const agent = await prisma.agent.upsert({
    where: { agentCode: 'RD-AGT-481723' },
    create: {
      agentCode: 'RD-AGT-481723',
      phoneNumber: '+2348091234567',
      fullName: 'Emeka Okonkwo',
      registeredStateCode: 'ANA',
      status: 'ACTIVE',
      tier: 'SILVER',
      commissionRate: 0.10,
      bvnHash: createHash('sha256').update('00000000000').digest('hex'),
      trainingCompletedAt: new Date(),
      agentAgreementSignedAt: new Date(),
    },
    update: { status: 'ACTIVE' },
  });
  console.log(`Agent ready: ${agent.agentCode} (${agent.phoneNumber}, ${agent.tier})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
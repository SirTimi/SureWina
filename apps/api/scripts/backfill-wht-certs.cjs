const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rate = Number(process.env.WHT_RATE_PERCENT ?? 5);
  const claims = await prisma.prizeClaim.findMany({
    where: { fulfilledAt: { not: null }, whtApplicable: true, whtAmountNgn: { gt: 0 }, whtDeduction: null },
  });

  for (const c of claims) {
    const created = await prisma.whtDeduction.create({
      data: {
        deductionRef: `PENDING-${c.claimId}`,
        claimId: c.claimId,
        winnerTicketRef: c.winnerTicketRef,
        winnerPhone: c.winnerPhone,
        grossPrizeNgn: c.grossPrizeValueNgn,
        whtRatePercent: rate,
        whtAmountNgn: c.whtAmountNgn,
        netPrizeNgn: c.netPrizeValueNgn,
      },
    });
    const deductionRef = `WHD-${new Date(c.fulfilledAt).getUTCFullYear()}-${String(created.deductionSeq).padStart(6, '0')}`;
    await prisma.whtDeduction.update({ where: { deductionSeq: created.deductionSeq }, data: { certificateNo } });
    console.log(`Issued ${certificateNo} for ${c.winnerTicketRef}`);
  }
  console.log(`Backfilled ${claims.length} certificate(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
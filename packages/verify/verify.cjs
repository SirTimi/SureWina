#!/usr/bin/env node
// Surewina independent draw verifier.
//
//   node verify.cjs <verification-url-or-json-file> <publicKeyBase64>
//
// Recomputes, from published data only:
//   1. sha256(revealed seed) === committed seed hash
//   2. Merkle root over the published pool === published root
//   3. Deterministic winner index → pool[i] === published winner
//   4. Ed25519 signature over the result payload, against the public key
//
// The public key should come from an out-of-band source you trust (e.g.
// Surewina's published key), NOT from the same server whose result you are
// checking — otherwise step 4 only proves self-consistency.
//
// NOTE: signature verification rebuilds the engine's exact JSON payload —
// key order below must match apps/engine/src/execution.service.ts verbatim.

const { createHash, createHmac, createPublicKey, verify } = require('crypto');
const { readFileSync } = require('fs');

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

// Must match apps/engine/src/draw-math.util.ts exactly.
function computeMerkleRoot(ids, drawCode) {
  if (ids.length === 0) return sha256Hex(`EMPTY:${drawCode}`);
  let level = ids.map((id) => sha256Hex(`${id}:${drawCode}`));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

// Must match apps/engine/src/draw-math.util.ts exactly.
function deterministicWinnerIndex(seed, drawCode, n) {
  if (n <= 0) throw new Error('Empty pool');
  if (n === 1) return 0;
  const key = createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from(`${drawCode}:WINNER_INDEX`)]))
    .digest();
  const nBig = BigInt(n);
  const range = 1n << 64n;
  const limit = (range / nBig) * nBig;
  for (let counter = 0; ; counter++) {
    const block = createHmac('sha256', key).update(Buffer.from(String(counter))).digest();
    const x = block.readBigUInt64BE(0);
    if (x < limit) return Number(x % nBig);
  }
}

async function loadBundle(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(source, 'utf8'));
}

function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
}

async function main() {
  const [source, publicKeyB64] = process.argv.slice(2);
  if (!source) {
    console.error('Usage: node verify.cjs <url-or-file> [publicKeyBase64]');
    process.exit(2);
  }

  const b = await loadBundle(source);
  console.log(`\nVerifying draw ${b.drawCode}`);
  console.log(`Published winner: ${b.winnerTicketRef}\n`);

  let allOk = true;
  const seed = Buffer.from(b.rngSeed, 'hex');

  // 1. Commit–reveal integrity
  allOk = check('seed hashes to committed hash', sha256Hex(seed) === b.rngSeedHash) && allOk;

  // 2. Pool integrity
  const merkle = computeMerkleRoot(b.pool, b.drawCode);
  allOk = check('Merkle root matches', merkle === b.merkleRoot, `${merkle.slice(0, 16)}…`) && allOk;
  allOk = check(
    'pool size matches participants',
    b.pool.length === b.totalEligibleParticipants,
    `${b.pool.length}`,
  ) && allOk;

  // 3. Winner recomputation — the core claim
  const idx = deterministicWinnerIndex(seed, b.drawCode, b.pool.length);
  allOk = check(
    'recomputed winner matches published winner',
    b.pool[idx] === b.winnerTicketRef,
    `index ${idx} → ${b.pool[idx]}`,
  ) && allOk;

  // 4. Engine signature (optional: needs the public key)
  if (publicKeyB64) {
    const payload = JSON.stringify({
      drawId: b.drawId,
      drawCode: b.drawCode,
      winnerTicketRef: b.winnerTicketRef,
      prizeValueNgn: b.prizeValueNgn,
      totalTicketsSold: b.totalTicketsSold,
      totalEligibleParticipants: b.totalEligibleParticipants,
      rngSeedHash: b.rngSeedHash,
      rngSeed: b.rngSeed,
      merkleRoot: b.merkleRoot,
      engineVersion: b.engineVersion,
      executedAt: b.executedAt,
    });
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const sigOk = verify(
      null,
      Buffer.from(payload, 'utf8'),
      publicKey,
      Buffer.from(b.engineSignature, 'base64'),
    );
    allOk = check('Ed25519 engine signature valid', sigOk) && allOk;
  } else {
    console.log('  SKIP  signature check (no public key supplied)');
  }

  console.log(allOk ? '\nVERIFIED: result is consistent and fair.\n' : '\nVERIFICATION FAILED.\n');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(2);
});
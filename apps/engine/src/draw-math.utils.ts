import { createHash, createHmac } from 'crypto';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

// Merkle root over leaf identifiers. Leaves are sha256(id + ':' + drawCode).
// Odd node at any level: last node is duplicated (bitcoin-style).
// The verifier must implement this identically.
export function computeMerkleRoot(ids: string[], drawCode: string): string {
  if (ids.length === 0) return sha256Hex(`EMPTY:${drawCode}`);

  let level = ids.map((id) => sha256Hex(`${id}:${drawCode}`));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

// Deterministic uniform index in [0, n): HMAC-SHA256 counter mode over a
// key derived from the seed and a label, with rejection sampling to remove
// modulo bias. The verifier must implement this identically.
export function deterministicIndex(seed: Buffer, label: string, n: number): number {
  if (n <= 0) throw new Error('Pool must be non-empty');
  if (n === 1) return 0;

  const key = createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from(label)]))
    .digest();

  const nBig = BigInt(n);
  const range = 1n << 64n;
  const limit = (range / nBig) * nBig; // rejection threshold

  for (let counter = 0; ; counter++) {
    const block = createHmac('sha256', key)
      .update(Buffer.from(String(counter)))
      .digest();
    const x = block.readBigUInt64BE(0);
    if (x < limit) return Number(x % nBig);
    // else reject and continue — probability of rejection is < n/2^64
  }
}

// The single-prize draw's winner. Unchanged since the first release, so every
// past result still verifies.
export function deterministicWinnerIndex(
  seed: Buffer,
  drawCode: string,
  n: number,
): number {
  return deterministicIndex(seed, `${drawCode}:WINNER_INDEX`, n);
}

// Prize pools and stages: `count` distinct winners, in pick order. Pick k
// draws uniformly from the entries not yet picked, using the label
// `${drawCode}:PICK:${k}`, so every remaining entry has an equal chance at
// every pick and no entry can win twice. Returns indexes into the pool, in
// pick order.
export function pickWinnerIndexes(
  seed: Buffer,
  drawCode: string,
  n: number,
  count: number,
): number[] {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Pool size must be 0 or more');
  if (!Number.isSafeInteger(count) || count < 0 || count > n) {
    throw new Error('Cannot pick more winners than there are entries');
  }

  // remaining[i] is the original index of the i-th entry still in play.
  const remaining = Array.from({ length: n }, (_, i) => i);
  const picked: number[] = [];

  for (let k = 0; k < count; k++) {
    const at = deterministicIndex(seed, `${drawCode}:PICK:${k}`, remaining.length);
    picked.push(remaining[at]);
    remaining.splice(at, 1);
  }

  return picked;
}

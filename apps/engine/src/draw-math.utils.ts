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
// key derived from the seed, with rejection sampling to remove modulo bias.
export function deterministicWinnerIndex(
  seed: Buffer,
  drawCode: string,
  n: number,
): number {
  if (n <= 0) throw new Error('Pool must be non-empty');
  if (n === 1) return 0;

  const key = createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from(`${drawCode}:WINNER_INDEX`)]))
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
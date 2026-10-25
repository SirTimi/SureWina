/**
 * Phase 6E offline acceptance register.
 * This module only validates recorded claims about evidence. It does not
 * inspect underlying provider artifacts, contact banks, or authorize release.
 */
export const PHASE6E_CASES = [
  { id: 'PP-01', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Paystack bank ownership confirmed using authentic identity evidence' },
  { id: 'PP-02', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Wrong BVN, mismatched identity, and failed ownership rejected' },
  { id: 'PP-03', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Locked beneficiary, account tampering, and authorized replacement tested' },
  { id: 'PP-04', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Pending transfer remains unresolved without second submission' },
  { id: 'PP-05', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Successful bank transfer independently verified before ledger finalization' },
  { id: 'PP-06', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Failed and reversed transfers never cause duplicate payouts' },
  { id: 'PP-07', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Signed webhook replays and out-of-order events are idempotent' },
  { id: 'PP-08', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Timeout and worker crash recover by immutable reference' },
  { id: 'PP-09', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Prize liability, transfer fees, clearing, WHT and bank statements reconcile' },
  { id: 'PP-10', rail: 'PRIZE_PAYOUT', environment: 'SANDBOX', label: 'Finance approvals, access control, alerts, incident response, limits tested' },
  { id: 'PP-11', rail: 'PRIZE_PAYOUT', environment: 'CONTRACT', label: 'Paystack transfer eligibility, actual available funding and approved operations documented' },
  { id: 'PP-12', rail: 'PRIZE_PAYOUT', environment: 'CONTROLLED_LIVE', label: 'Separately authorized small-value pilot and Finance reconciliation sign-off' },

  { id: 'CBA-01', rail: 'CBA_CASHOUT', environment: 'CONTRACT', label: 'Witmango guarantees unique idempotent debit references and explicit duplicate handling' },
  { id: 'CBA-02', rail: 'CBA_CASHOUT', environment: 'CONTRACT', label: 'Upstream hold or withdrawal restriction prevents external concurrent spending' },
  { id: 'CBA-03', rail: 'CBA_CASHOUT', environment: 'CONTRACT', label: 'Lost debit response recoverable by unique transaction ID without resubmission' },
  { id: 'CBA-04', rail: 'CBA_CASHOUT', environment: 'CONTRACT', label: 'Idempotent restoration deposits have independently verifiable proof' },
  { id: 'CBA-05', rail: 'CBA_CASHOUT', environment: 'CONTRACT', label: 'CBA-to-Paystack custody, settlement and fee-funding contracts reconcile' },
  { id: 'CBA-06', rail: 'CBA_CASHOUT', environment: 'SANDBOX', label: 'Standalone customer KYC and verified beneficiary lifecycle without prize claim' },
  { id: 'CBA-07', rail: 'CBA_CASHOUT', environment: 'SANDBOX', label: 'Simultaneous CBA withdrawal and external spend do not overspend' },
  { id: 'CBA-08', rail: 'CBA_CASHOUT', environment: 'SANDBOX', label: 'CBA debit, custody transfer and Paystack payout match exact references' },
  { id: 'CBA-09', rail: 'CBA_CASHOUT', environment: 'SANDBOX', label: 'Failed and reversed bank transfers require verified one-time CBA restoration' },
  { id: 'CBA-10', rail: 'CBA_CASHOUT', environment: 'SANDBOX', label: 'Crash, replay, manual review, AML checks and Finance duty separation tested' },
  { id: 'CBA-11', rail: 'CBA_CASHOUT', environment: 'CONTROLLED_LIVE', label: 'Separately authorized small-value cashout pilot and custodial reconciliation' },
] as const;

export type Phase6eRail = 'PRIZE_PAYOUT' | 'CBA_CASHOUT';
export type Phase6eEnvironment = 'SANDBOX' | 'CONTRACT' | 'CONTROLLED_LIVE';
export type Phase6eOutcome = 'PENDING' | 'PASS' | 'FAIL' | 'BLOCKED';

type EvidenceEntry = {
  id: string;
  environment: Phase6eEnvironment;
  outcome: Phase6eOutcome;
  evidenceSha256?: string;
  observedAt?: string;
  performedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type EvidenceManifest = {
  version: 1;
  entries: EvidenceEntry[];
};

type RailReport = {
  rail: Phase6eRail;
  total: number;
  documentedPasses: number;
  pending: number;
  failed: number;
  blocked: number;
  invalid: number;
  documentationComplete: boolean;
};

export type Phase6eReport = {
  status: 'EVIDENCE_PENDING' | 'DOCUMENTATION_COMPLETE_UNVERIFIED';
  releaseAuthorized: false;
  note: string;
  rails: RailReport[];
  issues: string[];
};

const environments = ['SANDBOX', 'CONTRACT', 'CONTROLLED_LIVE'];
const outcomes = ['PENDING', 'PASS', 'FAIL', 'BLOCKED'];
const allowedFields = new Set([
  'id', 'environment', 'outcome', 'evidenceSha256',
  'observedAt', 'performedBy', 'reviewedAt', 'reviewedBy',
]);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function date(value: unknown, now: Date): number | null {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now.getTime() ? parsed : null;
}

export function phase6eTemplate(): EvidenceManifest {
  return {
    version: 1,
    entries: PHASE6E_CASES.map((test) => ({
      id: test.id,
      environment: test.environment,
      outcome: 'PENDING' as const,
    })),
  };
}

export function assessPhase6eEvidence(input: unknown, now = new Date()): Phase6eReport {
  const issues: string[] = [];
  const source = object(input);
  if (!source || source.version !== 1 || !Array.isArray(source.entries)) {
    issues.push('Invalid register: expected version 1 with an entries array');
  }

  const found = new Map<string, Record<string, unknown>>();
  const validPassed = new Set<string>();
  const known = new Map<string, (typeof PHASE6E_CASES)[number]>(
    PHASE6E_CASES.map((item) => [item.id, item]),
  );

  for (const item of Array.isArray(source?.entries) ? source.entries : []) {
    const row = object(item);
    if (!row || typeof row.id !== 'string') {
      issues.push('Malformed register row');
      continue;
    }
    const id = row.id;
    if (!known.has(id)) {
      issues.push('Unrecognized case ID in register');
      continue;
    }
    if (found.has(id)) {
      issues.push(id + ': duplicate entry');
      continue;
    }
    found.set(id, row);

    const expected = known.get(id)!;
    const unexpected = Object.keys(row).some((key) => !allowedFields.has(key));
    if (unexpected) issues.push(id + ': unexpected fields (never store credentials, account numbers or raw provider payloads)');
    if (row.environment !== expected.environment ||
      !environments.includes(String(row.environment))) {
      issues.push(id + ': evidence environment does not match mandatory test stage');
    }
    if (!outcomes.includes(String(row.outcome))) {
      issues.push(id + ': unrecognized outcome');
    }
    if (row.outcome !== 'PASS') continue;

    const evidenceHashValid = typeof row.evidenceSha256 === 'string' &&
      /^[0-9a-f]{64}$/i.test(row.evidenceSha256);
    const executed = date(row.observedAt, now);
    const reviewed = date(row.reviewedAt, now);
    const performersValid =
      typeof row.performedBy === 'string' &&
      /^[a-zA-Z0-9._-]{3,80}$/.test(row.performedBy) &&
      typeof row.reviewedBy === 'string' &&
      /^[a-zA-Z0-9._-]{3,80}$/.test(row.reviewedBy) &&
      row.performedBy !== row.reviewedBy;

    if (!evidenceHashValid || executed === null || reviewed === null ||
      reviewed < executed || !performersValid || unexpected ||
      row.environment !== expected.environment) {
      issues.push(id + ': PASS lacks valid hash, UTC timestamps or independent reviewer');
    } else {
      // A hash is only a claim about a separately retained artifact;
      // no verification of that artifact takes place here.
      validPassed.add(id);
    }
  }

  for (const test of PHASE6E_CASES) {
    if (!found.has(test.id)) issues.push(test.id + ': missing entry');
  }

  const rails: RailReport[] = (['PRIZE_PAYOUT', 'CBA_CASHOUT'] as const).map((rail) => {
    const cases = PHASE6E_CASES.filter((test) => test.rail === rail);
    const count = (value: string) => cases.filter((test) =>
      found.get(test.id)?.outcome === value).length;
    const documentedPasses = cases.filter((test) => validPassed.has(test.id)).length;
    const invalid = cases.filter((test) =>
      found.get(test.id)?.outcome === 'PASS' && !validPassed.has(test.id)).length;
    return {
      rail,
      total: cases.length,
      documentedPasses,
      pending: count('PENDING') + cases.filter((test) => !found.has(test.id)).length,
      failed: count('FAIL'),
      blocked: count('BLOCKED'),
      invalid,
      documentationComplete: documentedPasses === cases.length && issues.length === 0,
    };
  });

  const complete = issues.length === 0 && rails.every((rail) => rail.documentationComplete);
  return {
    status: complete ? 'DOCUMENTATION_COMPLETE_UNVERIFIED' : 'EVIDENCE_PENDING',
    releaseAuthorized: false,
    note: 'This only checks the completeness of submitted claims and reviewers. It does not verify evidence files, authenticate sign-offs, authorize funding, or enable money movement.',
    rails,
    issues,
  };
}

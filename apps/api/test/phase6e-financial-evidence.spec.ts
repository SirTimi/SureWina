import {
  assessPhase6eEvidence, phase6eTemplate, PHASE6E_CASES,
} from '../src/rollout/phase6e-acceptance';

describe('Phase 6E: evidence-based acceptance remains fail-closed', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');
  const reviewed = () => ({
    evidenceSha256: 'a'.repeat(64),
    observedAt: '2026-10-20T12:00:00.000Z',
    performedBy: 'sandbox-tester-01',
    reviewedAt: '2026-10-21T12:00:00.000Z',
    reviewedBy: 'finance-reviewer-02',
    outcome: 'PASS' as const,
  });

  it('committed template has every mandatory case pending; no money release', () => {
    const template = phase6eTemplate();
    expect(template.entries).toHaveLength(PHASE6E_CASES.length);
    expect(template.entries.every((entry) => entry.outcome === 'PENDING')).toBe(true);
    const result = assessPhase6eEvidence(template, now);
    expect(result.status).toBe('EVIDENCE_PENDING');
    expect(result.releaseAuthorized).toBe(false);
    expect(result.rails).toHaveLength(2);
  });

  it('missing or unknown cases and duplicates are detected', () => {
    const template = phase6eTemplate();
    template.entries.splice(0, 1);
    template.entries.push({ id: 'NOT_REAL', environment: 'SANDBOX', outcome: 'PASS' });
    template.entries.push({ ...template.entries[0] });
    const result = assessPhase6eEvidence(template, now);
    expect(result.status).toBe('EVIDENCE_PENDING');
    expect(result.issues.join(' ')).toContain('missing entry');
    expect(result.issues.join(' ')).toContain('Unrecognized case');
    expect(result.issues.join(' ')).toContain('duplicate entry');
  });

  it('cannot mark PASS without independently reviewed dated evidence', () => {
    const template = phase6eTemplate();
    template.entries[0] = { ...template.entries[0], outcome: 'PASS' };
    const result = assessPhase6eEvidence(template, now);
    expect(result.rails[0].documentedPasses).toBe(0);
    expect(result.rails[0].invalid).toBe(1);
    expect(result.issues.join(' ')).toContain('independent reviewer');
  });

  it('rejects wrong environment, same reviewer, future dates, and extra sensitive fields', () => {
    const template = phase6eTemplate();
    template.entries[0] = { ...template.entries[0], ...reviewed(),
      environment: 'CONTRACT', reviewedBy: 'sandbox-tester-01',
      observedAt: '2026-10-27T00:00:00.000Z',
      rawAccountNumber: 'REDACT_THIS',
    } as never;
    const result = assessPhase6eEvidence(template, now);
    expect(result.status).toBe('EVIDENCE_PENDING');
    expect(result.issues.join(' ')).toContain('unexpected fields');
    expect(result.issues.join(' ')).toContain('environment');
    expect(result.issues.join(' ')).not.toContain('REDACT_THIS');
  });

  it('tracks prize payouts and CBA cashouts separately', () => {
    const template = phase6eTemplate();
    template.entries = template.entries.map((entry) => entry.id.startsWith('PP-')
      ? { ...entry, ...reviewed() } : entry);
    const result = assessPhase6eEvidence(template, now);
    expect(result.rails[0].documentedPasses).toBe(12);
    expect(result.rails[1].documentedPasses).toBe(0);
    expect(result.status).toBe('EVIDENCE_PENDING');
    expect(result.releaseAuthorized).toBe(false);
  });

  it('even perfect self-reported evidence never authorizes a live transfer', () => {
    const template = phase6eTemplate();
    template.entries = template.entries.map((entry) => ({ ...entry, ...reviewed() }));
    const result = assessPhase6eEvidence(template, now);
    expect(result.status).toBe('DOCUMENTATION_COMPLETE_UNVERIFIED');
    expect(result.rails.every((rail) => rail.documentationComplete)).toBe(true);
    expect(result.releaseAuthorized).toBe(false);
    expect(result.note).toContain('does not verify evidence files');
  });

  it('malformed JSON-shaped objects never claim acceptance', () => {
    expect(assessPhase6eEvidence(null, now).status).toBe('EVIDENCE_PENDING');
    expect(assessPhase6eEvidence({ version: 2, entries: [] }, now).releaseAuthorized).toBe(false);
    expect(assessPhase6eEvidence({ version: 1, entries: {} }, now).status).toBe('EVIDENCE_PENDING');
  });
});

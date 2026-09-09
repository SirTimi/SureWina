'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, FileImage, KeyRound, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminClaimDetail } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

export default function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminShell>{(session) => <Body id={id} session={session} />}</AdminShell>;
}

function Body({ id, session }: { id: string; session: AdminSession }) {
  const [claim, setClaim] = useState<AdminClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [reissued, setReissued] = useState<string | null>(null);

  const load = () => {
    api.admin
      .claimDetail(id)
      .then(setClaim)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load claim.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const reissue = async () => {
    if (!claim) return;
    if (
      !window.confirm(
        `Send a new collection code to ${claim.winnerPhone}?\n\nThe code they currently hold will stop working immediately.`,
      )
    ) {
      return;
    }
    setReissuing(true);
    setError(null);
    try {
      const res = await api.admin.reissueRedemptionCode(claim.claimId);
      setReissued(res.sentTo);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reissue the code.');
    } finally {
      setReissuing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error ?? 'Claim not found.'}</p>
          <Link href="/claims" className="mt-3 inline-block text-sm font-black text-navy-700 hover:underline">
            Back to claims
          </Link>
        </div>
      </div>
    );
  }

  // A code can only be replaced while one exists, the prize is still
  // collectable, and the deadline has not passed. Anything else and the
  // button would offer something the API will refuse.
  const canReissue =
    claim.redemption.codeIssued &&
    !claim.redemption.redeemedAt &&
    claim.status === 'KYC_CLEARED' &&
    new Date(claim.claimDeadlineAt).getTime() > Date.now();

  const attemptsLocked = claim.redemption.attempts >= 5;

  return (
    <>
      <PageHeader
        eyebrow="Claims"
        title={claim.winnerTicketRef}
        description={`${claim.draw.prizeDescription} · ${claim.draw.drawCode}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Claims', href: '/claims' },
          { label: claim.winnerTicketRef },
        ]}
        rightSlot={<StatusPill tone={statusToTone(claim.status)}>{claim.status}</StatusPill>}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {reissued && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <p className="text-sm text-emerald-900">
              A new collection code has been sent to{' '}
              <span className="font-mono font-black">{reissued}</span>. The previous code no
              longer works.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Gross prize" value={formatNaira(claim.grossPrizeValueNgn)} />
          <Kpi label="WHT" value={claim.whtAmountNgn > 0 ? formatNaira(claim.whtAmountNgn) : '—'} />
          <Kpi label="Net to winner" value={formatNaira(claim.netPrizeValueNgn)} accent />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Claim">
            <Row label="Winner phone">{claim.winnerPhone}</Row>
            <Row label="Prize path">{claim.claimType ?? 'Not chosen yet'}</Row>
            <Row label="Chosen at">
              {claim.claimTypeSelectedAt
                ? new Date(claim.claimTypeSelectedAt).toLocaleString('en-NG', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </Row>
            <Row label="Selection deadline">
              {new Date(claim.selectionDeadlineAt).toLocaleDateString('en-NG', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </Row>
            <Row label="Claim deadline">
              {new Date(claim.claimDeadlineAt).toLocaleDateString('en-NG', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </Row>
            <Row label="Draw executed">
              {new Date(claim.draw.executedAt).toLocaleString('en-NG', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Row>
            {claim.forfeitedAt && (
              <Row label="Forfeited">
                {new Date(claim.forfeitedAt).toLocaleDateString('en-NG', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </Row>
            )}
            {claim.fulfilledAt && (
              <Row label="Fulfilled">
                {new Date(claim.fulfilledAt).toLocaleString('en-NG', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </Row>
            )}
          </SectionCard>

          <SectionCard title="KYC state">
            <div className="space-y-2">
              <Check ok={claim.kyc.bvnVerified} label="BVN verified" detail={claim.kyc.bvnVerifiedAt ? new Date(claim.kyc.bvnVerifiedAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not verified'} />
              <Check ok={claim.kyc.hasIdDoc} label="ID document uploaded" detail={claim.kyc.hasIdDoc ? 'On file — view below' : 'Missing'} />
              <Check ok={claim.kyc.hasSelfie} label="Selfie uploaded" detail={claim.kyc.hasSelfie ? 'On file — view below' : 'Missing'} />
              <Check
                ok={!!claim.kyc.bank}
                label="Bank account resolved"
                detail={
                  claim.kyc.bank
                    ? `${claim.kyc.bank.accountName} · ····${claim.kyc.bank.accountLast4}`
                    : claim.claimType === 'CASH'
                      ? 'Missing — required for cash'
                      : 'Not required for product claims'
                }
              />
              {claim.kyc.reviewedAt && (
                <p className="pt-1 text-xs text-slate-500">
                  Reviewed{' '}
                  {new Date(claim.kyc.reviewedAt).toLocaleString('en-NG', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </SectionCard>
        </div>

        {/* The code is never readable here — only its hash is stored. This
            panel exists so a compliance officer taking a call can see
            whether one was sent, whether the counter has locked the winner
            out, and how many replacements have already gone. */}
        {claim.redemption.codeIssued && (
          <SectionCard
            title="Collection code"
            description="Sent to the winner by SMS. The code itself is stored only as a hash and cannot be read back."
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Row label="Issued">
                  {claim.redemption.codeIssuedAt
                    ? new Date(claim.redemption.codeIssuedAt).toLocaleString('en-NG', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })
                    : '—'}
                </Row>
                <Row label="Failed attempts">
                  <span className={attemptsLocked ? 'text-red-600' : undefined}>
                    {claim.redemption.attempts} of 5
                    {attemptsLocked ? ' · locked at the counter' : ''}
                  </span>
                </Row>
                <Row label="Times replaced">
                  <span className={claim.redemption.reissues >= 3 ? 'text-amber-700' : undefined}>
                    {claim.redemption.reissues}
                  </span>
                </Row>
                {claim.redemption.redeemedAt && (
                  <Row label="Collected">
                    {new Date(claim.redemption.redeemedAt).toLocaleString('en-NG', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </Row>
                )}
              </div>

              {canReissue && (
                <div className="max-w-[320px]">
                  <GuardedActionButton
                    session={session}
                    action="REVIEW_CLAIM_KYC"
                    icon={<KeyRound className="h-4 w-4" />}
                    onClick={reissue}
                    disabled={reissuing}
                    isLoading={reissuing}
                    className="rounded-md border-navy-200 bg-navy-50 text-navy-800"
                  >
                    {reissuing ? 'Sending…' : 'Send a new code'}
                  </GuardedActionButton>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Use when the winner has lost their SMS or is locked out. The old code stops
                    working immediately and the attempt count resets.
                  </p>
                </div>
              )}
            </div>

            {claim.redemption.reissues >= 3 && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                This code has been replaced {claim.redemption.reissues} times. Worth confirming
                the winner's identity by another means before sending another.
              </p>
            )}
          </SectionCard>
        )}

        {(claim.kyc.hasIdDoc || claim.kyc.hasSelfie) && (
          <SectionCard
            title="KYC evidence"
            description="Streamed over the authenticated session. Never cached, never public."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {claim.kyc.hasIdDoc && <Evidence claimId={claim.claimId} kind="id-doc" label="ID document" />}
              {claim.kyc.hasSelfie && <Evidence claimId={claim.claimId} kind="selfie" label="Selfie" />}
            </div>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {claim.payout && (
            <SectionCard title="Payout">
              <Row label="Reference">
                <span className="font-mono text-xs">{claim.payout.reference}</span>
              </Row>
              <Row label="Initiated">
                {claim.payout.initiatedAt
                  ? new Date(claim.payout.initiatedAt).toLocaleString('en-NG', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </Row>
              {claim.payout.accountLast4 && (
                <Row label="Account">····{claim.payout.accountLast4}</Row>
              )}
              {claim.whtDeduction && (
                <Row label="WHT deduction">
                  <span className="font-mono text-xs">{claim.whtDeduction.deductionRef}</span>
                </Row>
              )}
            </SectionCard>
          )}

          {claim.collection && (
            <SectionCard title="Collection">
              <Row label="Point">{claim.collection.pointName}</Row>
              <Row label="State">{claim.collection.stateCode}</Row>
              <Row label="Address">{claim.collection.address}</Row>
              <Row label="Scheduled">
                {claim.collection.scheduledAt
                  ? new Date(claim.collection.scheduledAt).toLocaleDateString('en-NG', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                  : '—'}
              </Row>
            </SectionCard>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Approve/reject actions live in the{' '}
          <Link href="/claims" className="font-black text-navy-700 hover:underline">
            review queue
          </Link>
          , which enforces the full evidence gate.
        </p>
      </div>
    </>
  );
}

// Authed image: fetch bytes with the JWT, object-URL them, revoke on unmount.
function Evidence({ claimId, kind, label }: { claimId: string; kind: 'id-doc' | 'selfie'; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    api.admin
      .fetchClaimEvidence(claimId, kind)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [claimId, kind]);

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        <FileImage className="h-3.5 w-3.5" />
        {label}
      </p>
      {failed ? (
        <div className="flex h-56 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm text-red-600">
          Could not load — file may be missing from storage.
        </div>
      ) : !url ? (
        <div className="h-56 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <img
          src={url}
          alt={label}
          className="max-h-[420px] w-full rounded-lg border border-slate-200 object-contain"
        />
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? 'rounded-xl border border-navy-200 bg-navy-50 p-4' : 'rounded-xl border border-slate-200 bg-white p-4'}>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={accent ? 'mt-1 font-display text-xl font-black text-navy-800' : 'mt-1 font-display text-xl font-black text-[#0B1220]'}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
      )}
      <div>
        <p className="text-sm font-bold text-[#0B1220]">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
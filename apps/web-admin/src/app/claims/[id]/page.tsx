'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, FileImage, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminClaimDetail } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

export default function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminShell>{() => <Body id={id} />}</AdminShell>;
}

function Body({ id }: { id: string }) {
  const [claim, setClaim] = useState<AdminClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .claimDetail(id)
      .then(setClaim)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load claim.'))
      .finally(() => setLoading(false));
  }, [id]);

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
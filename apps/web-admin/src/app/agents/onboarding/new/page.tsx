'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AlertTriangle, BadgeCheck, Copy, IdCard, ShieldCheck, UserPlus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import {
  canPerformAdminAction,
  getAdminActionDeniedReason,
  type AdminSession,
} from '@/lib/admin-auth';
import { api } from '@/lib/api';

const ID_TYPES = [
  { value: 'NIN_SLIP', label: 'NIN slip' },
  { value: 'DRIVERS_LICENCE', label: "Driver's licence" },
  { value: 'VOTERS_CARD', label: "Voter's card" },
  { value: 'PASSPORT', label: 'International passport' },
];

const STATES = ['ANA', 'LAG', 'FCT', 'RIV', 'KAN', 'OYO', 'ENU', 'DEL', 'EDO', 'ABI'];

export default function RegisterAgentPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+234');
  const [email, setEmail] = useState('');
  const [stateCode, setStateCode] = useState('LAG');
  const [nin, setNin] = useState('');
  const [bvn, setBvn] = useState('');
  const [idDocType, setIdDocType] = useState('NIN_SLIP');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{
    agentId: string;
    code: string;
    name: string;
    terminalNumber: string | null;
  } | null>(null);

  const allowed = canPerformAdminAction(session.tier, 'INITIATE_AGENT_PROFILING');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) return setError('Enter the agent’s full name.');
    if (!/^\+234\d{10}$/.test(phoneNumber)) return setError('Phone must be +234 followed by 10 digits.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError('Enter the agent’s email — their registration details are sent there.');
    if (!/^\d{11}$/.test(nin)) return setError('NIN must be exactly 11 digits.');
    if (!/^\d{11}$/.test(bvn)) return setError('BVN must be exactly 11 digits.');
    if (!confirmed) return setError('Confirm you sighted the original identity document.');

    setSubmitting(true);
    try {
      const res = await api.admin.onboardAgent({
        fullName: fullName.trim(),
        phoneNumber,
        email: email.trim().toLowerCase(),
        registeredStateCode: stateCode,
        nin,
        bvn,
        idDocType,
        ...(note.trim() ? { onboardingNote: note.trim() } : {}),
      });
      setCreated({
        agentId: res.agentId,
        code: res.agentCode,
        name: fullName.trim(),
        terminalNumber: res.terminalNumber,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register agent.');
      setSubmitting(false);
    }
  };

  // Clears the form rather than reloading the route. router.refresh() left
  // every field populated, so registering a second agent started from the
  // previous one's details.
  const registerAnother = () => {
    setFullName('');
    setPhoneNumber('+234');
    setEmail('');
    setNin('');
    setBvn('');
    setNote('');
    setConfirmed(false);
    setCreated(null);
    setError(null);
    setSubmitting(false);
  };

  const copyTerminal = async () => {
    if (!created?.terminalNumber) return;
    try {
      await navigator.clipboard.writeText(created.terminalNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Agents" title="Register agent" breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Agents', href: '/agents' }, { label: 'Register' }]} />
        <div className="mx-auto max-w-[760px] px-6 py-10">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
            <p className="mt-3 text-sm text-slate-700">
              {getAdminActionDeniedReason(session.tier, 'INITIATE_AGENT_PROFILING')}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (created) {
    return (
      <>
        <PageHeader eyebrow="Agents" title="Agent registered" breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Agents', href: '/agents' }, { label: 'Registered' }]} />
        <div className="mx-auto max-w-[760px] px-6 py-5">
          <SectionCard title={`${created.name} is registered`}>
            {/* Assigned on creation and printed on every ticket this agent
                sells. Shown here because this is the only moment someone is
                present to write it down. */}
            <div className="rounded-lg border-2 border-navy-200 bg-navy-50 p-5 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Terminal number
              </p>
              <p className="mt-2 font-mono text-5xl font-black tracking-[0.12em] text-[#0B1220]">
                {created.terminalNumber ?? '—'}
              </p>
              {created.terminalNumber && (
                <button
                  type="button"
                  onClick={copyTerminal}
                  className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-black text-navy-700"
                >
                  {copied ? <BadgeCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Give this to {created.name.split(' ')[0]} now. It appears on every ticket they
                sell and is how a customer query is traced back to them. It has also been
                emailed to them.
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Agent code</p>
              <p className="mt-1 font-mono text-2xl font-black text-[#0B1220]">{created.code}</p>
              <p className="mt-3 text-sm text-emerald-900">
                They are <span className="font-black">pending activation</span>. Complete training and
                the signed agreement, then a compliance officer activates them from the
                onboarding queue.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/agents/onboarding" className="rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white">
                Onboarding queue
              </Link>
              <Link href={`/agents/${created.agentId}`} className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600">
                Open agent record
              </Link>
              <button
                type="button"
                onClick={registerAnother}
                className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
              >
                Register another
              </button>
            </div>
          </SectionCard>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="Register agent"
        description="In-office registration. Capture identity details with the originals in front of you."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Agents', href: '/agents' }, { label: 'Register' }]}
      />

      <div className="mx-auto max-w-[760px] px-6 py-5">
        <form onSubmit={submit} className="space-y-4">
          <SectionCard title="Personal details">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name (as on ID)">
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Emeka Okonkwo" className={inputCls} />
                </Field>
                <Field label="Phone (E.164)">
                  <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+2348012345678" className={`${inputCls} font-mono`} />
                </Field>
                <Field label="Email">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </Field>
                <Field label="State of operation">
                  <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputCls}>
                    {STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Identity"
            description="Numbers are verified, hashed, and never stored in readable form."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="NIN (11 digits)">
                  <input
                    value={nin}
                    onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    inputMode="numeric"
                    className={`${inputCls} font-mono tracking-widest`}
                  />
                </Field>
                <Field label="BVN (11 digits)">
                  <input
                    value={bvn}
                    onChange={(e) => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    inputMode="numeric"
                    className={`${inputCls} font-mono tracking-widest`}
                  />
                </Field>
              </div>

              <Field label="Means of identification sighted">
                <div className="grid grid-cols-2 gap-2">
                  {ID_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setIdDocType(t.value)}
                      className={
                        idDocType === t.value
                          ? 'flex items-center gap-2 rounded-lg border-2 border-navy-700 bg-navy-50 p-3 text-sm font-black text-[#0B1220]'
                          : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-600 hover:border-slate-300'
                      }
                    >
                      <IdCard className="h-4 w-4" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anything worth recording about this registration…"
                  className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm outline-none focus:border-navy-700"
                />
              </Field>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-xs leading-relaxed text-amber-900">
                  I confirm I have <span className="font-black">sighted the original</span> identity
                  document and that the details above match it. This registration is recorded
                  against my admin account.
                </span>
              </label>
            </div>
          </SectionCard>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
            >
              <UserPlus className="h-4 w-4" />
              {submitting ? 'Registering…' : 'Register agent'}
            </button>
            <Link href="/agents/onboarding" className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600">
              Cancel
            </Link>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
            <p className="text-xs leading-relaxed text-slate-600">
              Identity verification currently runs in development mode — well-formed numbers are
              accepted without a provider check. Agents registered now are flagged in the audit log
              and should be re-verified once the identity provider is live.
            </p>
          </div>
        </form>
      </div>
    </>
  );
}

const inputCls =
  'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">{label}</label>
      {children}
    </div>
  );
}
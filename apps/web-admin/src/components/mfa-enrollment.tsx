'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api';

type Stage = 'idle' | 'scanning' | 'done';

export function MfaEnrollment({
  mfaEnabled,
  onEnrolled,
}: {
  mfaEnabled: boolean;
  onEnrolled: () => void;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.setupMfa();
      setSecret(res.secret);
      setOtpauthUri(res.otpauthUri);
      setStage('scanning');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.activateMfa(code.trim());
      setBackupCodes(res.backupCodes);
      setStage('done');
      onEnrolled();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not accepted.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (mfaEnabled && stage !== 'done') {
    return (
      <SectionCard title="Two-factor authentication">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-[#0B1220]">Active on this account</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Sign-in requires a code from your authenticator app. To move to a new phone, ask
              another SUPER admin to reset it for you.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (stage === 'done') {
    return (
      <SectionCard title="Save your backup codes">
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
            <KeyRound className="h-4 w-4" />
            Shown once — store them somewhere safe
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {backupCodes.map((c) => (
              <span
                key={c}
                className="rounded-md bg-white px-3 py-2 text-center font-mono text-sm font-black text-[#0B1220]"
              >
                {c}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n'))}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-800"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy all
          </button>

          <p className="mt-3 text-xs leading-relaxed text-amber-800">
            Each code works exactly once, and only if your authenticator is unavailable. If you
            lose both your phone and these codes, another SUPER admin has to reset your access.
          </p>
        </div>
      </SectionCard>
    );
  }

  if (stage === 'scanning') {
    return (
      <SectionCard
        title="Set up two-factor authentication"
        description="Scan with Google Authenticator, Authy, or any TOTP app."
      >
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-3">
            <QRCodeSVG value={otpauthUri} size={168} />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Can&apos;t scan? Enter this key
              </p>
              <p className="mt-1 break-all rounded-md bg-[#F8FAF4] p-2 font-mono text-xs text-slate-700">
                {secret}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">
                Enter the current 6-digit code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                placeholder="000000"
                className="h-11 w-40 rounded-md border border-slate-200 bg-white px-3 text-center font-mono text-lg tracking-[0.2em] outline-none focus:border-navy-700"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || code.trim().length !== 6}
                onClick={activate}
                className="rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
              >
                {busy ? 'Verifying…' : 'Turn on 2FA'}
              </button>
              <button
                type="button"
                onClick={() => setStage('idle')}
                className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Two-factor authentication">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-bold text-[#0B1220]">Not enabled</p>
            <p className="mt-0.5 max-w-md text-xs text-slate-500">
              Your password alone protects actions like approving draws, changing tax rates, and
              creating admins. Adding a code from your phone means a stolen password isn&apos;t
              enough on its own.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={start}
          className="rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
        >
          {busy ? 'Starting…' : 'Set up 2FA'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </SectionCard>
  );
}
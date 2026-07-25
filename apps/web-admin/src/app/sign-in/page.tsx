'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button, Card, Logo } from '@surewina/ui';
import { saveSession } from '@/lib/admin-auth';
import { api, storeToken, toAdminSession } from '@/lib/api';
import type { AdminAuthResponse } from '@surewina/api-client';

export default function AdminSignInPage() {
  const router = useRouter();
  const [stage, setStage] = useState<'password' | 'mfa'>('password');
  const [email, setEmail] = useState('admin@surewina.local');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeSignIn = (res: AdminAuthResponse) => {
    storeToken(res.accessToken);
    saveSession(toAdminSession(res.admin));
    router.push('/');
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 4) {
      setError('Enter a valid admin email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.admin.login(email.trim(), password);

      // MFA-enabled accounts get a challenge instead of a token.
      if ('mfaRequired' in res) {
        setChallengeId(res.challengeId);
        setStage('mfa');
        setPassword('');
        setSubmitting(false);
        return;
      }

      completeSignIn(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setSubmitting(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.admin.verifyMfa(challengeId, code.trim());
      completeSignIn(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setCode('');
      setSubmitting(false);
    }
  };

  const backToPassword = () => {
    setStage('password');
    setChallengeId(null);
    setCode('');
    setError(null);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7FB] px-4">
      <Card className="w-full max-w-md rounded-3xl border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="rounded-sm bg-navy-800 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
            Admin
          </span>
        </div>

        {stage === 'mfa' ? (
          <>
            <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-navy-950">
              Verification code
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter the 6-digit code from your authenticator app, or one of your backup codes.
            </p>

            <form onSubmit={submitCode} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-bold text-navy-950">
                  <KeyRound className="h-4 w-4" /> Code
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-lg tracking-[0.3em] text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                isLoading={submitting}
                disabled={submitting || code.trim().length < 6}
                fullWidth
                size="lg"
                className="rounded-sm !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-800"
              >
                <ShieldCheck className="h-5 w-5" />
                Verify
                <ArrowRight className="h-5 w-5" />
              </Button>

              <button
                type="button"
                onClick={backToPassword}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Use a different account
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-navy-950">
              Admin sign-in
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Restricted access. All actions are audited.
            </p>

            <form onSubmit={submitPassword} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-bold text-navy-950">
                  <Mail className="h-4 w-4" /> Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-bold text-navy-950">
                  <Lock className="h-4 w-4" /> Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                isLoading={submitting}
                disabled={submitting}
                fullWidth
                size="lg"
                className="rounded-sm !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-800"
              >
                <ShieldCheck className="h-5 w-5" />
                Sign in
                <ArrowRight className="h-5 w-5" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
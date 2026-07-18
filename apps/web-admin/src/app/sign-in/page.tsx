'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button, Card, Logo } from '@surewina/ui';
import { saveSession } from '@/lib/admin-auth';
import { api, storeToken, toAdminSession } from '@/lib/api';

export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@surewina.local');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 4) {
      setError('Enter a valid admin email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.admin.login(email.trim(), password);
      storeToken(res.accessToken);
      saveSession(toAdminSession(res.admin));
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setSubmitting(false);
    }
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

        <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-navy-950">
          Admin sign-in
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Restricted access. All actions are audited.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
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
      </Card>
    </main>
  );
}
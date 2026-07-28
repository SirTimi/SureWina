'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button, Card, Logo } from '@surewina/ui';
import { api } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError('Choose a password of at least 10 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('The new password must be different from your current one.');
      return;
    }

    setSubmitting(true);
    try {
      await api.admin.changePassword(currentPassword, newPassword);
      // The session's flag is now stale — a fresh sign-in is the simplest
      // way to get a token and session that reflect the change.
      router.push('/sign-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
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
          Choose a new password
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account is using a temporary password issued by another admin. Set your own before
          continuing.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-bold text-navy-950">
              <KeyRound className="h-4 w-4" /> Temporary password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-navy-950">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
            />
            <p className="mt-1 text-xs text-slate-500">At least 10 characters.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-navy-950">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
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
            Set password
          </Button>
        </form>
      </Card>
    </main>
  );
}
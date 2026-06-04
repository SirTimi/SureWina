'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Mail, Shield, ShieldCheck } from 'lucide-react';
import { Button, Card, Logo } from '@surewina/ui';
import { roleDescription, saveSession, type AdminRole } from '@/lib/admin-auth';

const DEMO_OPTIONS: Array<{
  role: AdminRole;
  email: string;
  fullName: string;
  description: string;
}> = [
  {
    role: 'BASIC_ADMIN',
    email: 'basic.admin@surewina.ng',
    fullName: 'Sade Bello',
    description: 'Basic Admin · enquiries, status checks, initiation tasks',
  },
  {
    role: 'INTERMEDIATE_ADMIN',
    email: 'intermediate.admin@surewina.ng',
    fullName: 'Ifeanyi Okafor',
    description: 'Intermediate Admin · first-level review and approvals',
  },
  {
    role: 'SUPER_ADMIN',
    email: 'super.admin@surewina.ng',
    fullName: 'Tunde Adekunle',
    description: 'Super Admin · final approvals and admin management',
  },
  {
    role: 'AUDITOR',
    email: 'auditor@surewina.ng',
    fullName: 'Aisha Mohammed',
    description: 'Auditor · read-only query access and escalation',
  },
];

export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('super.admin@surewina.ng');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState('');
  const [step, setStep] = useState<'creds' | 'mfa'>('creds');
  const [error, setError] = useState<string | null>(null);

  const submitCreds = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 4) {
      setError('Enter a valid admin email and password.');
      return;
    }
    setError(null);
    setStep('mfa');
  };

  const submitMfa = (e: FormEvent) => {
    e.preventDefault();
    if (mfa.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit MFA code.');
      return;
    }
    const pick = DEMO_OPTIONS.find((o) => o.email === email) ?? DEMO_OPTIONS[2];
    saveSession({
      adminUserId: `usr_${pick.role.toLowerCase()}`,
      email: pick.email,
      fullName: pick.fullName,
      role: pick.role,
      mfaEnabled: true,
      lastLoginAt: new Date().toISOString(),
    });
    router.push('/');
  };

  const quickSignIn = (opt: (typeof DEMO_OPTIONS)[number]) => {
    saveSession({
      adminUserId: `usr_${opt.role.toLowerCase()}`,
      email: opt.email,
      fullName: opt.fullName,
      role: opt.role,
      mfaEnabled: true,
      lastLoginAt: new Date().toISOString(),
    });
    router.push('/');
  };

  return (
    <main className="min-h-screen bg-[#0B1220] px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1100px] flex-col">
        <div className="flex h-16 items-center justify-between">
          <Logo />
          <span className="hidden items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur sm:inline-flex">
            <ShieldCheck className="h-4 w-4" />
            Admin console
          </span>
        </div>

        <div className="grid flex-1 grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_440px]">
          <section className="hidden lg:block">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">
              Governance console
            </p>
            <h1 className="mt-3 font-display text-6xl font-black leading-[0.98] tracking-[-0.05em]">
              Least privilege.
              <br />
              <span className="text-[#A8E368]">Clear roles.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              Sign in with the admin role assigned to your clearance level. Demo accounts
              show how Basic Admin, Intermediate Admin, Super Admin, and Auditor access differs.
            </p>
            <ul className="mt-8 max-w-md space-y-3 text-sm text-white/75">
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-400" />
                Basic Admin handles enquiries, status checks, and initiation tasks
              </li>
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-400" />
                Super Admin handles authorization and admin management
              </li>
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-400" />
                Auditor has read-only query access with no approval rights
              </li>
            </ul>
          </section>

          <Card
            variant="default"
            className="rounded-3xl border-white/10 bg-white p-6 text-[#0B1220] shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
          >
            <div className="mb-5">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                {step === 'mfa' ? <Lock className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
              </div>
              <h2 className="font-display text-3xl font-black tracking-[-0.03em]">
                {step === 'mfa' ? 'Enter MFA code' : 'Admin sign in'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {step === 'mfa'
                  ? '6-digit code from your authenticator app.'
                  : 'Use your @surewina.ng email and password.'}
              </p>
            </div>

            {step === 'creds' ? (
              <form onSubmit={submitCreds} className="space-y-3">
                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@surewina.ng"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
                  />
                </Field>
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  fullWidth
                  className="rounded-md !border-transparent bg-amber-500 font-black text-[#0B1220] hover:!border-transparent hover:bg-amber-400"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={submitMfa} className="space-y-3">
                <Field label="MFA code">
                  <input
                    inputMode="numeric"
                    value={mfa}
                    onChange={(e) => setMfa(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="h-14 w-full rounded-lg border border-slate-200 bg-white px-3 text-center font-mono text-2xl font-black tracking-[0.24em] text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
                  />
                </Field>
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Demo: enter any 6 digits, for example <span className="font-mono font-black">000000</span>.
                </p>
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  fullWidth
                  className="rounded-md !border-transparent bg-amber-500 font-black text-[#0B1220] hover:!border-transparent hover:bg-amber-400"
                >
                  Verify & sign in
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <button type="button" onClick={() => setStep('creds')} className="w-full text-sm font-bold text-slate-500">
                  Back to credentials
                </button>
              </form>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Quick sign-in demo roles
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {DEMO_OPTIONS.map((opt) => (
                  <button
                    key={opt.role}
                    type="button"
                    onClick={() => quickSignIn(opt)}
                    title={roleDescription(opt.role)}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-navy-200 hover:bg-[#F8FAF4]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#0B1220]">{opt.fullName}</p>
                      <p className="truncate text-xs text-slate-500">{opt.description}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-navy-700" />
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-[#0B1220]">{label}</span>
      {children}
    </label>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
      {children}
    </p>
  );
}

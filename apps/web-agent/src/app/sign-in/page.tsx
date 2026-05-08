'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Phone, ShieldCheck } from 'lucide-react';
import { Button, Card, Logo } from '@surewina/ui';
import { api } from '@/lib/api';
import { saveAgentSession } from '@/lib/agent-auth';

export default function AgentSignInPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+2348091234567');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [mockOtp, setMockOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!phone.trim()) {
      setError('Enter your registered agent phone number.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.agents.requestOtp({ phoneE164: phone.trim() });
      setChallengeId(res.challengeId);
      setMockOtp(res.mockOtp ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!challengeId) return;

    if (otp.trim().length < 6) {
      setError('Enter the 6-digit OTP.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.agents.verifyOtp({
        challengeId,
        otp: otp.trim(),
      });

      saveAgentSession({
        agent: res.agent,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_75%_20%,rgba(168,227,104,0.32),transparent_42%),linear-gradient(135deg,#ffffff_0%,#F8FAF4_55%,#A8E368_140%)] px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1100px] flex-col">
        <div className="flex h-16 items-center justify-between">
          <Logo />

          <div className="hidden items-center gap-2 rounded-sm border border-[#4E8F01]/10 bg-white/80 px-3 py-2 text-xs font-bold text-[#4E8F01] shadow-sm sm:flex">
            <ShieldCheck className="h-4 w-4" />
            Agent portal
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_420px]">
          <section className="hidden lg:block">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4E8F01]">
              Sell tickets faster
            </p>

            <h1 className="mt-3 max-w-2xl font-display text-6xl font-black leading-[0.98] tracking-[-0.06em] text-navy-950">
              Agent sales in under 60 seconds.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Built for roadside agents, slow phones, and unstable networks. Sign in,
              sell tickets, track commission, and settle remittance.
            </p>

            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              <SignInStat label="Critical flow" value="60s" />
              <SignInStat label="Network target" value="3G" />
              <SignInStat label="Primary device" value="Tecno" />
            </div>
          </section>

          <Card
            variant="default"
            className="rounded-3xl border-slate-200 bg-white/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6"
          >
            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                {challengeId ? <Lock className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
              </div>

              <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-navy-950">
                {challengeId ? 'Enter OTP' : 'Agent sign in'}
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {challengeId
                  ? 'Enter the code sent to your registered phone number.'
                  : 'Use your registered agent phone number to continue.'}
              </p>
            </div>

            {!challengeId ? (
              <form onSubmit={requestOtp}>
                <label htmlFor="phone" className="mb-2 block text-sm font-bold text-navy-950">
                  Phone number
                </label>

                <input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+234..."
                  inputMode="tel"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-base font-bold text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
                />

                {error && <ErrorMessage message={error} />}

                <Button
                  type="submit"
                  isLoading={loading}
                  disabled={loading}
                  variant="accent"
                  size="lg"
                  fullWidth
                  className="mt-5 rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
                >
                  Send OTP
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <label htmlFor="otp" className="mb-2 block text-sm font-bold text-navy-950">
                  OTP code
                </label>

                <input
                  id="otp"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  inputMode="numeric"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-2xl font-black tracking-[0.24em] text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
                />

                {mockOtp && (
                  <div className="mt-3 rounded-xl border border-[#4E8F01]/15 bg-[#F8FAF4] px-3 py-2 text-sm text-slate-600">
                    Demo OTP:{' '}
                    <span className="font-mono font-black text-[#4E8F01]">{mockOtp}</span>
                  </div>
                )}

                {error && <ErrorMessage message={error} />}

                <Button
                  type="submit"
                  isLoading={loading}
                  disabled={loading || otp.length !== 6}
                  variant="accent"
                  size="lg"
                  fullWidth
                  className="mt-5 rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
                >
                  Verify and enter
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setChallengeId(null);
                    setOtp('');
                    setMockOtp(null);
                    setError(null);
                  }}
                  className="mt-4 w-full text-sm font-bold text-slate-500"
                >
                  Use another phone number
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function SignInStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#4E8F01]/10 bg-white/80 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black text-navy-950">{value}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}
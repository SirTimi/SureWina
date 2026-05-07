'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Phone, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatPhoneForDisplay } from '@surewina/utils';
import { api } from '@/lib/api';

interface OtpFormProps {
  challengeId: string;
  phoneE164: string;
  nextPath: string;
  mockOtp?: string;
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

export function OtpForm({ challengeId, phoneE164, nextPath, mockOtp }: OtpFormProps) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_S);
  const [activeChallengeId, setActiveChallengeId] = useState(challengeId);
  const [activeMockOtp, setActiveMockOtp] = useState(mockOtp);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const setDigit = (idx: number, val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[idx] = cleaned;
    setDigits(next);

    if (cleaned && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }

    if (cleaned && idx === OTP_LENGTH - 1 && next.every((d) => d !== '')) {
      void verify(next.join(''));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = pasted.split('').concat(Array(OTP_LENGTH - pasted.length).fill(''));
    setDigits(next);

    const lastFilled = Math.min(pasted.length, OTP_LENGTH) - 1;
    inputRefs.current[lastFilled]?.focus();

    if (pasted.length === OTP_LENGTH) {
      void verify(pasted);
    }
  };

  const verify = async (code: string) => {
    setError(null);
    setIsVerifying(true);

    try {
      const result = await api.auth.verifyOtp({
        challengeId: activeChallengeId,
        otp: code,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('surewina_access_token', result.accessToken);
        localStorage.setItem('surewina_refresh_token', result.refreshToken);
        localStorage.setItem('surewina_user_id', result.user.userId);
      }

      router.push(result.isNewUser ? `${nextPath}?welcome=1` : nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);

    try {
      const result = await api.auth.requestOtp({ phoneE164 });
      setActiveChallengeId(result.challengeId);
      setActiveMockOtp(result.mockOtp);
      setResendCooldown(RESEND_COOLDOWN_S);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    }
  };

  return (
    <Card
      variant="default"
      className="rounded-3xl border-slate-200 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-8"
    >
      <div className="mb-8 flex items-center gap-2">
        <div className="h-1 w-16 rounded-full bg-[#4E8F01]" />
        <div className="h-1 w-16 rounded-full bg-[#4E8F01]" />
      </div>

      <Link
        href={`/sign-in${nextPath !== '/dashboard' ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
        className="mb-6 inline-flex items-center gap-1 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Use a different number
      </Link>

      <div className="mb-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-[#4E8F01]/90 px-4 py-2 text-sm font-semibold text-white shadow-sm">
          <ShieldCheck className="h-4 w-4 text-white" />
          Verify your phone
        </div>

        <h1 className="font-display text-4xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-5xl">
          Enter the code.
        </h1>

        <p className="mt-4 text-base leading-relaxed text-slate-600">
          We sent a 6-digit code to{' '}
          <span className="font-mono font-black text-navy-950">
            {formatPhoneForDisplay(phoneE164)}
          </span>
        </p>
      </div>

      {activeMockOtp && (
        <div className="mb-6 rounded-sm border border-[#A8E368]/40 bg-[#A8E368]/15 p-3 text-xs">
          <span className="font-black text-[#4E8F01]">Dev mode:</span>{' '}
          <span className="text-slate-700">
            Use code{' '}
            <span className="font-mono font-black text-navy-950">{activeMockOtp}</span> or{' '}
            <span className="font-mono font-black text-navy-950">123456</span>
          </span>
        </div>
      )}

      <div className="mt-8 flex max-w-md justify-between gap-2">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => setDigit(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            disabled={isVerifying}
            className="h-14 w-12 rounded-sm border-2 border-slate-200 bg-white text-center font-display text-2xl font-black tabular-nums text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/35 disabled:opacity-50 sm:h-16 sm:w-14"
            autoComplete="one-time-code"
            aria-label={`Digit ${idx + 1}`}
          />
        ))}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-sm border border-red-100 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm leading-relaxed text-slate-700">{error}</p>
        </div>
      )}

      {isVerifying && <p className="mt-4 text-sm font-medium text-slate-500">Verifying…</p>}

      <div className="mt-6 border-t border-slate-100 pt-6">
        <p className="text-sm text-slate-500">
          Didn&apos;t get the code?{' '}
          {resendCooldown > 0 ? (
            <span className="text-slate-400">
              Resend in <span className="font-mono">{resendCooldown}s</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
            >
              Resend code
            </button>
          )}
        </p>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <Phone className="h-3 w-3 text-[#4E8F01]" />
          Still nothing?{' '}
          <a href="tel:0700SUREWINA" className="font-bold text-[#4E8F01] hover:text-[#3f7601]">
            Call 0700-SUREWINA
          </a>{' '}
          for a voice OTP.
        </p>
      </div>
    </Card>
  );
}
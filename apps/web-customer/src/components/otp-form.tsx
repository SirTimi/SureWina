'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, Phone } from 'lucide-react';
import { Button } from '@surewina/ui';
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

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-focus first input on mount
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

    // Auto-submit when all 6 digits filled
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

      // Persist tokens — for now we use localStorage; backend will switch to httpOnly cookies
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
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="h-1 w-16 bg-navy-800 rounded-full" />
        <div className="h-1 w-16 bg-navy-800 rounded-full" />
      </div>

      <Link
        href={`/sign-in${nextPath !== '/dashboard' ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
        className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-navy-800 mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Use a different number
      </Link>

      <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink-950">
        Enter the code
      </h1>
      <p className="text-base text-ink-500 mt-2 leading-relaxed">
        We sent a 6-digit code to{' '}
        <span className="font-semibold text-ink-950 font-mono">
          {formatPhoneForDisplay(phoneE164)}
        </span>
      </p>

      {/* Mock OTP hint — never appears in production */}
      {activeMockOtp && (
        <div className="mt-4 bg-amber-50 border border-amber-100 rounded-md p-3 text-xs">
          <span className="text-amber-700 font-semibold">Dev mode:</span>{' '}
          <span className="text-ink-700">
            Use code <span className="font-mono font-bold text-ink-950">{activeMockOtp}</span> or{' '}
            <span className="font-mono font-bold text-ink-950">123456</span>
          </span>
        </div>
      )}

      {/* OTP boxes */}
      <div className="mt-8 flex gap-2 justify-between max-w-md">
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
            className="w-12 h-14 sm:w-14 sm:h-16 text-center font-display font-bold text-2xl tabular-nums bg-white border-2 border-ink-200 rounded-md outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20 disabled:opacity-50 transition-colors"
            autoComplete="one-time-code"
            aria-label={`Digit ${idx + 1}`}
          />
        ))}
      </div>

      {error && (
        <div className="mt-4 bg-danger-bg border border-danger/20 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}

      {isVerifying && (
        <p className="mt-4 text-sm text-ink-500">Verifying…</p>
      )}

      {/* Resend */}
      <div className="mt-6 pt-6 border-t border-ink-100">
        <p className="text-sm text-ink-500">
          Didn&apos;t get the code?{' '}
          {resendCooldown > 0 ? (
            <span className="text-ink-300">
              Resend in <span className="font-mono">{resendCooldown}s</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="text-navy-800 hover:text-navy-700 font-medium"
            >
              Resend code
            </button>
          )}
        </p>
        <p className="text-xs text-ink-500 mt-2 flex items-center gap-1.5">
          <Phone className="w-3 h-3" />
          Still nothing?{' '}
          <a href="tel:0700SUREWINA" className="text-navy-800 hover:text-navy-700">
            Call 0700-SUREWINA
          </a>{' '}
          for a voice OTP.
        </p>
      </div>
    </div>
  );
}
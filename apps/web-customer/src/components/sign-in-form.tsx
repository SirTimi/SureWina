'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, Lock, Mail, Phone } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { isValidNigerianPhone, normalizePhone } from '@surewina/utils';
import { api } from '@/lib/api';
import Link from 'next/link';

type Mode = 'phone' | 'email';

const phoneSchema = z.object({
  credential: z
    .string()
    .min(1, 'Phone number is required')
    .refine((val) => isValidNigerianPhone(val), {
      message: 'Enter a valid Nigerian phone number',
    })
    .transform((val) => normalizePhone(val) as string),
});

const emailSchema = z.object({
  credential: z
    .string()
    .min(1, 'Email address is required')
    .email('Enter a valid email address')
    .transform((val) => val.trim().toLowerCase()),
});

type SignInFormValues = { credential: string };

interface SignInFormProps {
  nextPath: string;
}

export function SignInForm({ nextPath }: SignInFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('phone');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(mode === 'phone' ? phoneSchema : emailSchema),
    defaultValues: { credential: '' },
  });

  const switchMode = (next: Mode) => {
    setMode(next);
    setSubmitError(null);
    reset({ credential: '' });
  };

  const onSubmit = async (data: SignInFormValues) => {
    setSubmitError(null);

    try {
      const result = await api.auth.requestOtp(
        mode === 'phone' ? { phoneE164: data.credential } : { email: data.credential },
      );

      const params = new URLSearchParams({
        challenge: result.challengeId,
        next: nextPath,
        // The verify screen tells the user where to look for the code.
        ...(mode === 'phone'
          ? { phone: data.credential }
          : { email: data.credential }),
        ...(result.debugOtp ? { debugOtp: result.debugOtp } : {}),
      });

      router.push(`/sign-in/verify?${params.toString()}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : mode === 'phone'
            ? 'Could not send code. Try again or use a different number.'
            : 'Could not send code. Try again or sign in with your phone number.',
      );
    }
  };

  const isPhone = mode === 'phone';

  return (
    <Card
      variant="default"
      className="rounded-3xl border-slate-200 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-8"
    >
      <div className="mb-8 flex items-center gap-2">
        <div className="h-1 w-16 rounded-full bg-navy-800" />
        <div className="h-1 w-16 rounded-full bg-amber-500/45" />
      </div>

      <div className="mb-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-800/90 px-4 py-2 text-sm font-semibold text-white shadow-sm">
          <Lock className="h-4 w-4 text-white" />
          Passwordless sign in
        </div>

        <h1 className="font-display text-4xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-5xl">
          Sign in to play.
        </h1>

        <p className="mt-4 text-base leading-relaxed text-slate-600">
          {isPhone
            ? 'We\u2019ll text you a 6-digit code. No password to remember, no app to download.'
            : 'We\u2019ll email you a 6-digit code, and text it too. Use this if your SMS isn\u2019t arriving.'}
        </p>
      </div>

      <div className="mb-5 inline-flex rounded-sm border border-slate-200 bg-[#F8FAF4] p-1">
        <button
          type="button"
          onClick={() => switchMode('phone')}
          className={
            isPhone
              ? 'rounded-sm bg-navy-800 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white'
              : 'rounded-sm px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500'
          }
        >
          Phone
        </button>
        <button
          type="button"
          onClick={() => switchMode('email')}
          className={
            !isPhone
              ? 'rounded-sm bg-navy-800 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white'
              : 'rounded-sm px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500'
          }
        >
          Email
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <label htmlFor="credential" className="mb-2 block text-sm font-black text-navy-950">
          {isPhone ? 'Phone number' : 'Email address'}
        </label>

        <div className="flex overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          {isPhone && (
            <span className="inline-flex items-center border-r border-slate-200 bg-[#F8FAF4] px-3 font-mono text-xs font-bold text-navy-700">
              NG +234
            </span>
          )}

          <div className="relative flex-1">
            {isPhone ? (
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700" />
            ) : (
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700" />
            )}

            <input
              id="credential"
              // key forces a fresh input when switching, so the browser doesn't
              // keep the old value or autofill the wrong credential type.
              key={mode}
              type={isPhone ? 'tel' : 'email'}
              {...register('credential')}
              placeholder={isPhone ? '803 412 9018' : 'you@example.com'}
              className="h-12 w-full bg-white pl-10 pr-3 text-base text-navy-950 outline-none placeholder:text-slate-400"
              autoComplete={isPhone ? 'tel-national' : 'email'}
              autoFocus
            />
          </div>
        </div>

        {errors.credential && (
          <p className="mt-2 flex items-start gap-1 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {errors.credential.message}
          </p>
        )}

        {!isPhone && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            This only works for an email already on your account. If you haven&apos;t added
            one, sign in with your phone first.
          </p>
        )}

        {submitError && (
          <div className="mt-4 flex items-start gap-2 rounded-sm border border-red-100 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm leading-relaxed text-slate-700">{submitError}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          className="mt-6 rounded-sm !border-transparent bg-navy-800 font-bold text-white hover:!border-transparent hover:bg-navy-800"
        >
          {isSubmitting ? 'Sending code…' : 'Send code'}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-navy-700" />
        <span>
          By continuing you confirm you are 18 or older. We never share your details with
          third parties.
        </span>
      </p>

      <p className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
        Just want to buy a ticket?{' '}
        <Link href="/" className="font-bold text-navy-700 hover:text-navy-800">
          No account needed →
        </Link>
      </p>
    </Card>
  );
}
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, Lock, Phone } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { isValidNigerianPhone, normalizePhone } from '@surewina/utils';
import { api } from '@/lib/api';
import Link from 'next/link';

const signInSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .refine((val) => isValidNigerianPhone(val), {
      message: 'Enter a valid Nigerian phone number',
    })
    .transform((val) => normalizePhone(val) as string),
});

type SignInFormValues = z.input<typeof signInSchema>;

interface SignInFormProps {
  nextPath: string;
}

export function SignInForm({ nextPath }: SignInFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { phone: '' },
  });

  const onSubmit = async (data: SignInFormValues) => {
    setSubmitError(null);

    try {
      const result = await api.auth.requestOtp({ phoneE164: data.phone as string });
      const params = new URLSearchParams({
        challenge: result.challengeId,
        phone: data.phone as string,
        next: nextPath,
        ...(result.mockOtp ? { mockOtp: result.mockOtp } : {}),
      });

      router.push(`/sign-in/verify?${params.toString()}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Could not send code. Try again or use a different number.',
      );
    }
  };

  return (
    <Card
      variant="default"
      className="rounded-3xl border-slate-200 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-8"
    >
      <div className="mb-8 flex items-center gap-2">
        <div className="h-1 w-16 rounded-full bg-[#4E8F01]" />
        <div className="h-1 w-16 rounded-full bg-[#A8E368]/45" />
      </div>

      <div className="mb-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-[#4E8F01]/90 px-4 py-2 text-sm font-semibold text-white shadow-sm">
          <Lock className="h-4 w-4 text-white" />
          Passwordless sign in
        </div>

        <h1 className="font-display text-4xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-5xl">
          Sign in to play.
        </h1>

        <p className="mt-4 text-base leading-relaxed text-slate-600">
          We&apos;ll text you a 6-digit code. No password to remember, no app to download.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <label htmlFor="phone" className="mb-2 block text-sm font-black text-navy-950">
          Phone number
        </label>

        <div className="flex overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-[#4E8F01] focus-within:ring-2 focus-within:ring-[#A8E368]/35">
          <span className="inline-flex items-center border-r border-slate-200 bg-[#F8FAF4] px-3 font-mono text-xs font-bold text-[#4E8F01]">
            NG +234
          </span>

          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4E8F01]" />
            <input
              id="phone"
              type="tel"
              {...register('phone')}
              placeholder="803 412 9018"
              className="h-12 w-full bg-white pl-10 pr-3 text-base text-navy-950 outline-none placeholder:text-slate-400"
              autoComplete="tel-national"
              autoFocus
            />
          </div>
        </div>

        {errors.phone && (
          <p className="mt-2 flex items-start gap-1 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {errors.phone.message}
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
          className="mt-6 rounded-sm !border-transparent bg-[#4E8F01] font-bold text-white hover:!border-transparent hover:bg-[#3f7601]"
        >
          {isSubmitting ? 'Sending code…' : 'Send code'}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-[#4E8F01]" />
        <span>
          By continuing you confirm you are 18 or older. We never share your number with
          third parties.
        </span>
      </p>

      <p className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
        Just want to buy a ticket?{' '}
        <Link href="/" className="font-bold text-[#4E8F01] hover:text-[#3f7601]">
          No account needed →
        </Link>
      </p>
    </Card>
  );
}
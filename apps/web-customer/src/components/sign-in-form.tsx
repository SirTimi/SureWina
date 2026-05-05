'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, AlertCircle, Lock } from 'lucide-react';
import { Button } from '@surewina/ui';
import { isValidNigerianPhone, normalizePhone } from '@surewina/utils';
import { api } from '@/lib/api';

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
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="h-1 w-16 bg-navy-800 rounded-full" />
        <div className="h-1 w-16 bg-ink-100 rounded-full" />
      </div>

      <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink-950">
        Sign in to play
      </h1>
      <p className="text-base text-ink-500 mt-2 leading-relaxed">
        We&apos;ll text you a 6-digit code. No password to remember, no app to download.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8">
        <label htmlFor="phone" className="block text-sm font-medium text-ink-700 mb-2">
          Phone number
        </label>
        <div className="flex items-stretch border border-ink-200 rounded-md overflow-hidden bg-white">
          <span className="inline-flex items-center px-3 bg-ink-50 border-r border-ink-200 font-mono text-xs text-ink-500">
            NG +234
          </span>
          <input
            id="phone"
            type="tel"
            {...register('phone')}
            placeholder="803 412 9018"
            className="flex-1 px-3 py-3 bg-white text-base outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
            autoComplete="tel-national"
            autoFocus
          />
        </div>
        {errors.phone && (
          <p className="text-xs text-danger mt-2 flex items-start gap-1">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            {errors.phone.message}
          </p>
        )}

        {submitError && (
          <div className="mt-4 bg-danger-bg border border-danger/20 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-ink-700">{submitError}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          className="mt-6"
        >
          {isSubmitting ? 'Sending code…' : 'Send code'}
          {!isSubmitting && <ArrowRight className="w-4 h-4" />}
        </Button>
      </form>

      <p className="text-xs text-ink-500 mt-6 flex items-start gap-1.5 leading-relaxed">
        <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          By continuing you confirm you are 18 or older. We never share your number with third
          parties.
        </span>
      </p>

      <p className="text-sm text-ink-500 mt-8 pt-6 border-t border-ink-100 text-center">
        Just want to buy a ticket?{' '}
        <a href="/" className="text-navy-800 hover:text-navy-700 font-medium">
          No account needed →
        </a>
      </p>
    </div>
  );
}
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check } from 'lucide-react';
import { Button } from '@surewina/ui';
import type { UserMe } from '@surewina/types';
import { api } from '@/lib/api';

const profileSchema = z.object({
  displayName: z
    .string()
    .max(100, 'Name is too long')
    .optional(),
  email: z
    .string()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('')),
});

type ProfileFormValues = z.input<typeof profileSchema>;

export function ProfileForm({
  user,
  onUpdate,
}: {
  user: UserMe;
  onUpdate: (u: UserMe) => void;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName ?? '',
      email: user.email ?? '',
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    setError(null);
    try {
      const updated = await api.account.updateProfile({
        displayName: data.displayName?.trim() || null,
        email: data.email?.trim() || null,
      });
      onUpdate(updated);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-ink-700 mb-2">
          Display name <span className="text-ink-300 font-normal">(optional)</span>
        </label>
        <input
          id="displayName"
          type="text"
          {...register('displayName')}
          className="w-full max-w-md h-11 px-3 bg-white border border-ink-200 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
          placeholder="How should we greet you?"
        />
        {errors.displayName && <FieldError message={errors.displayName.message} />}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-700 mb-2">
          Email <span className="text-ink-300 font-normal">(optional)</span>
        </label>
        <input
          id="email"
          type="email"
          {...register('email')}
          className="w-full max-w-md h-11 px-3 bg-white border border-ink-200 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
          placeholder="you@example.com"
          autoComplete="email"
        />
        {errors.email && <FieldError message={errors.email.message} />}
        <p className="text-xs text-ink-500 mt-1.5">
          Used only for tax certificates. We never send promo emails without explicit opt-in.
        </p>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSubmitting}
          disabled={!isDirty}
        >
          {isSubmitting ? 'Saving…' : 'Save profile'}
        </Button>
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check className="w-4 h-4" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-danger mt-1.5 flex items-start gap-1">
      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
      {message}
    </p>
  );
}
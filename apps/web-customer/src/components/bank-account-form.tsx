
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check, Edit2 } from 'lucide-react';

import { Button } from '@surewina/ui';
import type { UserMe } from '@surewina/types';
import { api } from '@/lib/api';
import { useNigerianBanks } from '@/hooks/use-nigerian-banks';

const bankSchema = z.object({
  bankCode: z.string().min(1, 'Select your bank'),
  accountNumber: z
    .string()
    .min(1, 'Account number is required')
    .regex(/^\d{10}$/, 'Account number must be exactly 10 digits'),
});

type BankFormValues = z.input<typeof bankSchema>;

export function BankAccountForm({
  user,
  onUpdate,
}: {
  user: UserMe;
  onUpdate: (u: UserMe) => void;
}) {
  const [editing, setEditing] = useState(user.bankAccount === null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    banks,
    loading: banksLoading,
    error: banksError,
  } = useNigerianBanks();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      bankCode: '',
      accountNumber: '',
    },
  });

  const bankListUnavailable =
    banksLoading || !!banksError || banks.length === 0;

  const onSubmit = async (data: BankFormValues) => {
    setError(null);

    if (
      bankListUnavailable ||
      !banks.some((bank) => bank.code === data.bankCode)
    ) {
      setError('Please select a supported Nigerian bank.');
      return;
    }

    try {
      const result = await api.account.updateBankAccount({
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
      });

      onUpdate({
        ...user,
        bankAccount: result.bankAccount,
      });

      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
      setEditing(false);

      reset({
        bankCode: '',
        accountNumber: '',
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save bank account.',
      );
    }
  };

  if (!editing && user.bankAccount) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display font-semibold text-ink-950">
            {user.bankAccount.bankName}
          </p>

          <p className="mt-0.5 text-sm text-ink-700">
            {user.bankAccount.accountName}
          </p>

          <p className="mt-0.5 font-mono text-sm text-ink-500">
            ●●●● ●●●● {user.bankAccount.accountNumber}
          </p>

          <p className="mt-2 text-xs text-ink-500">
            Bank details saved. Identity and payout approval
            are verified separately.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          className="flex-shrink-0"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Change
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <div>
        <label
          htmlFor="bankCode"
          className="mb-2 block text-sm font-medium text-ink-700"
        >
          Bank
        </label>

        <select
          id="bankCode"
          {...register('bankCode')}
          disabled={bankListUnavailable || isSubmitting}
          className="h-11 w-full max-w-md appearance-none rounded-md border border-ink-200 bg-white px-3 pr-10 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%235A6869' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",
            backgroundPosition: 'right 1rem center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <option value="">
            {banksLoading
              ? 'Loading Nigerian banks...'
              : banksError
                ? 'Banks unavailable'
                : banks.length === 0
                  ? 'No banks available'
                  : 'Select your bank…'}
          </option>

          {banks.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>

        {errors.bankCode && (
          <FieldError message={errors.bankCode.message} />
        )}

        {banksError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {banksError}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="accountNumber"
          className="mb-2 block text-sm font-medium text-ink-700"
        >
          Account number
        </label>

        <input
          id="accountNumber"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          {...register('accountNumber')}
          disabled={isSubmitting}
          className="h-11 w-full max-w-md rounded-md border border-ink-200 bg-white px-3 font-mono text-base tabular-nums focus:border-transparent focus:outline-none focus:ring-2 focus:ring-navy-700"
          placeholder="0123456789"
        />

        {errors.accountNumber && (
          <FieldError message={errors.accountNumber.message} />
        )}

        <p className="mt-1.5 text-xs text-ink-500">
          We&apos;ll resolve your account name through Paystack.
          Account ownership verification happens separately.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-bg p-3"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-danger" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSubmitting}
          disabled={isSubmitting || bankListUnavailable}
        >
          {isSubmitting
            ? 'Checking account…'
            : user.bankAccount
              ? 'Update bank account'
              : 'Save bank account'}
        </Button>

        {user.bankAccount && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              setEditing(false);
              reset();
              setError(null);
            }}
          >
            Cancel
          </Button>
        )}

        {savedAt !== null && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />
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
    <p className="mt-1.5 flex items-start gap-1 text-xs text-danger">
      <AlertCircle className="h-3 w-3 flex-shrink-0" />
      {message}
    </p>
  );
}

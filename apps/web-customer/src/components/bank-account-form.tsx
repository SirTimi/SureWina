'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check, Edit2 } from 'lucide-react';
import { Button } from '@surewina/ui';
import type { UserMe } from '@surewina/types';
import { api } from '@/lib/api';

const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '232', name: 'Sterling Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '030', name: 'Heritage Bank' },
  { code: '999991', name: 'OPay' },
  { code: '999992', name: 'PalmPay' },
  { code: '999993', name: 'Kuda' },
];

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
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: { bankCode: '', accountNumber: '' },
  });

  const onSubmit = async (data: BankFormValues) => {
    setError(null);
    try {
      const result = await api.account.updateBankAccount({
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
      });
      onUpdate({ ...user, bankAccount: result.bankAccount });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
      setEditing(false);
      reset({ bankCode: '', accountNumber: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save bank account.');
    }
  };

  if (!editing && user.bankAccount) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display font-semibold text-ink-950">{user.bankAccount.bankName}</p>
          <p className="text-sm text-ink-700 mt-0.5">{user.bankAccount.accountName}</p>
          <p className="text-sm text-ink-500 mt-0.5 font-mono">
            ●●●● ●●●● {user.bankAccount.accountNumber}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          className="flex-shrink-0"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Change
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="bankCode" className="block text-sm font-medium text-ink-700 mb-2">
          Bank
        </label>
        <select
          id="bankCode"
          {...register('bankCode')}
          className="w-full max-w-md h-11 px-3 bg-white border border-ink-200 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent appearance-none bg-no-repeat pr-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%235A6869' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",
            backgroundPosition: 'right 1rem center',
          }}
        >
          <option value="">Select your bank…</option>
          {NIGERIAN_BANKS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        {errors.bankCode && <FieldError message={errors.bankCode.message} />}
      </div>

      <div>
        <label htmlFor="accountNumber" className="block text-sm font-medium text-ink-700 mb-2">
          Account number
        </label>
        <input
          id="accountNumber"
          type="text"
          inputMode="numeric"
          {...register('accountNumber')}
          maxLength={10}
          className="w-full max-w-md h-11 px-3 bg-white border border-ink-200 rounded-md text-base font-mono focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent tabular-nums"
          placeholder="0123456789"
        />
        {errors.accountNumber && <FieldError message={errors.accountNumber.message} />}
        <p className="text-xs text-ink-500 mt-1.5">
          We&apos;ll verify your account name automatically with your bank. Make sure the
          number matches the name on your KYC documents.
        </p>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
          {isSubmitting ? 'Saving…' : user.bankAccount ? 'Update bank account' : 'Save bank account'}
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
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Minus, Plus, Lock, AlertCircle } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira, getAllStatesSorted } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import { api } from '@/lib/api';
import {
  purchaseSchema,
  type PurchaseFormValues,
  type PurchaseFormParsed,
} from '@/lib/schemas';

interface BuyFormProps {
  draw: DrawPublic;
  initialQuantity: number;
}

const paymentMethods = [
  { id: 'CARD' as const, label: 'Card / Bank', sublabel: 'Visa, Verve, Mastercard' },
  { id: 'TRANSFER' as const, label: 'Bank transfer', sublabel: 'Direct from your bank app' },
  { id: 'USSD' as const, label: 'USSD', sublabel: '*894#' },
  { id: 'OPAY' as const, label: 'OPay wallet', sublabel: 'Pay from OPay balance' },
];

export function BuyForm({ draw, initialQuantity }: BuyFormProps) {
  const router = useRouter();
  const states = getAllStatesSorted();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues, unknown, PurchaseFormParsed>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      quantity: initialQuantity,
      phone: '',
      stateOfPlayCode: '',
      paymentMethod: 'CARD',
      ageConfirmed: false,
    },
  });

  const quantity = watch('quantity');
  const paymentMethod = watch('paymentMethod');

  const adjustQuantity = (delta: number) => {
    const next = Math.max(1, Math.min(100, (quantity ?? 1) + delta));
    setValue('quantity', next, { shouldValidate: true });
  };

  const onSubmit: SubmitHandler<PurchaseFormParsed> = async (data) => {
    setSubmitError(null);
    try {
      const result = await api.tickets.initiatePurchase({
        drawCode: draw.drawCode,
        quantity: data.quantity,
        phoneE164: data.phone,
        stateOfPlayCode: data.stateOfPlayCode,
        paymentMethod: data.paymentMethod,
      });
      router.push(result.redirectUrl);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Could not start your purchase. Try again or contact support.',
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Quantity */}
      <Card variant="default" className="p-6">
        <label htmlFor="quantity" className="block text-sm font-medium text-ink-700 mb-3">
          How many tickets?
        </label>
        <div className="flex items-stretch border border-ink-200 rounded-md overflow-hidden max-w-xs">
          <button
            type="button"
            onClick={() => adjustQuantity(-1)}
            className="px-4 bg-ink-50 hover:bg-ink-100 transition-colors disabled:opacity-50"
            disabled={quantity <= 1}
            aria-label="Decrease"
          >
            <Minus className="w-4 h-4 text-ink-700" />
          </button>
          <input
            id="quantity"
            type="number"
            {...register('quantity', { valueAsNumber: true })}
            className="flex-1 text-center font-display text-lg font-semibold tabular-nums bg-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min={1}
            max={100}
          />
          <button
            type="button"
            onClick={() => adjustQuantity(1)}
            className="px-4 bg-ink-50 hover:bg-ink-100 transition-colors disabled:opacity-50"
            disabled={quantity >= 100}
            aria-label="Increase"
          >
            <Plus className="w-4 h-4 text-ink-700" />
          </button>
        </div>
        {errors.quantity && <FieldError message={errors.quantity.message} />}

        {draw.drawType === 'DAILY_STANDARD' && quantity >= 1 && (
          <p className="text-xs text-amber-700 mt-3">
            {10 - (quantity % 10) === 10
              ? `${Math.floor(quantity / 10)} free Saturday jackpot ${Math.floor(quantity / 10) === 1 ? 'entry' : 'entries'} unlocked.`
              : `${10 - (quantity % 10)} more for a free Saturday jackpot entry.`}
          </p>
        )}
      </Card>

      {/* Phone number */}
      <Card variant="default" className="p-6">
        <label htmlFor="phone" className="block text-sm font-medium text-ink-700 mb-3">
          Phone number
        </label>
        <div className="flex items-stretch border border-ink-200 rounded-md overflow-hidden max-w-md">
          <span className="inline-flex items-center px-3 bg-ink-50 border-r border-ink-200 font-mono text-xs text-ink-500">
            NG +234
          </span>
          <input
            id="phone"
            type="tel"
            {...register('phone')}
            placeholder="803 123 4567"
            className="flex-1 px-3 py-2.5 bg-white text-base outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent"
            autoComplete="tel-national"
          />
        </div>
        {errors.phone && <FieldError message={errors.phone.message} />}
        <p className="text-xs text-ink-500 mt-2">
          Your ticket reference goes here by SMS within 30 seconds. We never share your number.
        </p>
      </Card>

      {/* State of play */}
      <Card variant="default" className="p-6">
        <label htmlFor="stateOfPlayCode" className="block text-sm font-medium text-ink-700 mb-3">
          State of play
        </label>
        <select
          id="stateOfPlayCode"
          {...register('stateOfPlayCode')}
          className="w-full max-w-md h-11 px-3 bg-white border border-ink-200 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent appearance-none bg-no-repeat bg-right pr-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%235A6869' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",
            backgroundPosition: 'right 1rem center',
          }}
        >
          <option value="">Select your state…</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        {errors.stateOfPlayCode && <FieldError message={errors.stateOfPlayCode.message} />}
        <p className="text-xs text-ink-500 mt-2">
          This is a regulatory requirement — your ticket is recorded against this state for State
          Lottery Board reporting. You can&apos;t change it after purchase.
        </p>
      </Card>

      {/* Payment method */}
      <Card variant="default" className="p-5 sm:p-6">
        <p className="block text-sm font-medium text-ink-700 mb-3">Pay with</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {paymentMethods.map((m) => {
            const isSelected = paymentMethod === m.id;
            return (
              <label
                key={m.id}
                className={
                  isSelected
                    ? 'flex items-start gap-3 p-3 sm:p-4 border-2 border-navy-700 bg-navy-50/30 rounded-md cursor-pointer'
                    : 'flex items-start gap-3 p-3 sm:p-4 border border-ink-200 bg-white rounded-md cursor-pointer hover:border-ink-300 transition-colors'
                }
              >
                <input
                  type="radio"
                  value={m.id}
                  {...register('paymentMethod')}
                  className="mt-1 w-4 h-4 accent-navy-800 flex-shrink-0"
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-semibold text-ink-950">{m.label}</span>
                  <span className="text-xs text-ink-500">{m.sublabel}</span>
                </div>
              </label>
            );
          })}
        </div>
        {errors.paymentMethod && <FieldError message={errors.paymentMethod.message} />}
      </Card>

      {/* T&Cs + submit */}
      <Card variant="default" className="p-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('ageConfirmed')}
            className="mt-1 w-4 h-4 accent-navy-800"
          />
          <span className="text-sm text-ink-700 leading-relaxed">
            I confirm I am 18 years or older and I accept the{' '}
            <a href="/terms" className="underline hover:text-navy-700" target="_blank">
              raffle rules
            </a>{' '}
            and{' '}
            <a href="/privacy" className="underline hover:text-navy-700" target="_blank">
              privacy policy
            </a>
            .
          </span>
        </label>
        {errors.ageConfirmed && <FieldError message={errors.ageConfirmed.message} />}

        {submitError && (
          <div className="mt-4 bg-danger-bg border border-danger/20 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-ink-700">{submitError}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          className="mt-5"
        >
          {isSubmitting
            ? 'Starting payment…'
            : `Continue to payment — ${formatNaira((quantity ?? 1) * draw.ticketPriceNgn)}`}
        </Button>

        <p className="text-xs text-ink-500 mt-3 flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3" />
          Payment is processed by your gateway, not by us. We never store card details.
        </p>
      </Card>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-danger mt-2 flex items-start gap-1">
      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
      {message}
    </p>
  );
}
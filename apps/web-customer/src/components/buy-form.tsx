'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Lock, Minus, Phone, Plus } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira, getAllStatesSorted } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import {
  getFreeJackpotEntriesFromRegularTickets,
  getTicketsToNextFreeJackpotEntry,
} from '@surewina/types';
import { api } from '@/lib/api';
import {
  purchaseSchema,
  type PurchaseFormParsed,
  type PurchaseFormValues,
} from '@/lib/schemas';

interface BuyFormProps {
  draw: DrawPublic;
  initialQuantity: number;
  onQuantityChange?: (quantity: number) => void;
}

const paymentMethods = [
  { id: 'CARD' as const, label: 'Card / Bank', sublabel: 'Visa, Verve, Mastercard' },
  { id: 'TRANSFER' as const, label: 'Bank transfer', sublabel: 'Direct from your bank app' },
  { id: 'USSD' as const, label: 'USSD', sublabel: '*894#' },
  { id: 'OPAY' as const, label: 'OPay wallet', sublabel: 'Pay from OPay balance' },
];

export function BuyForm({ draw, initialQuantity, onQuantityChange }: BuyFormProps) {
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
  const safeQuantity = Math.max(1, Math.min(100, Number(quantity) || 1));
  const isJackpotPurchase = draw.drawType === 'SATURDAY_JACKPOT';
  const freeJackpotEntries = getFreeJackpotEntriesFromRegularTickets(safeQuantity);
  const ticketsToNextJackpotEntry = getTicketsToNextFreeJackpotEntry(safeQuantity);

  useEffect(() => {
    onQuantityChange?.(safeQuantity);
  }, [onQuantityChange, safeQuantity]);

  const adjustQuantity = (delta: number) => {
    const next = Math.max(1, Math.min(100, safeQuantity + delta));
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
          Ticket quantity
        </p>

        <label htmlFor="quantity" className="mb-3 block text-sm font-black text-navy-950">
          How many tickets?
        </label>

        <div className="flex max-w-xs overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          <button type="button" onClick={() => adjustQuantity(-1)} className="px-4 text-navy-700 transition hover:bg-amber-50 disabled:opacity-50" disabled={safeQuantity <= 1} aria-label="Decrease">
            <Minus className="h-4 w-4" />
          </button>

          <input
            id="quantity"
            type="number"
            {...register('quantity', { valueAsNumber: true })}
            className="h-12 flex-1 bg-white text-center font-display text-xl font-black tabular-nums text-navy-950 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            min={1}
            max={100}
          />

          <button type="button" onClick={() => adjustQuantity(1)} className="px-4 text-navy-700 transition hover:bg-amber-50 disabled:opacity-50" disabled={safeQuantity >= 100} aria-label="Increase">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {errors.quantity && <FieldError message={errors.quantity.message} />}

        {!isJackpotPurchase && safeQuantity >= 1 && (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-bold text-navy-950">
              {freeJackpotEntries > 0
                ? `${freeJackpotEntries} free Sure Jackpot ${
                    freeJackpotEntries === 1 ? 'entry' : 'entries'
                  } unlocked with this purchase.`
                : `${ticketsToNextJackpotEntry} more regular ticket${
                    ticketsToNextJackpotEntry === 1 ? '' : 's'
                  } to unlock 1 free Sure Jackpot entry.`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Every 10 regular ₦500 tickets gives the customer 1 free entry into the coming Saturday jackpot draw.
            </p>
          </div>
        )}

        {isJackpotPurchase && (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-bold text-navy-950">This is a direct Sure Jackpot ticket.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Jackpot tickets bought directly go straight into the coming Saturday jackpot draw bucket.
            </p>
          </div>
        )}
      </Card>

      <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Buyer details</p>
        <label htmlFor="phone" className="mb-3 block text-sm font-black text-navy-950">Phone number</label>
        <div className="flex max-w-md overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          <span className="inline-flex items-center border-r border-slate-200 bg-[#F8FAF4] px-3 font-mono text-xs font-bold text-navy-700">NG +234</span>
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700" />
            <input id="phone" type="tel" {...register('phone')} placeholder="803 123 4567" className="h-12 w-full bg-white pl-10 pr-3 text-base text-navy-950 outline-none placeholder:text-slate-400" autoComplete="tel-national" />
          </div>
        </div>
        {errors.phone && <FieldError message={errors.phone.message} />}
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Your ticket reference goes here by SMS within 30 seconds. We never share your number.</p>
      </Card>

      <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Regulatory info</p>
        <label htmlFor="stateOfPlayCode" className="mb-3 block text-sm font-black text-navy-950">State of play</label>
        <select
          id="stateOfPlayCode"
          {...register('stateOfPlayCode')}
          className="h-12 w-full max-w-md appearance-none rounded-sm border border-slate-200 bg-white bg-no-repeat px-3 pr-10 text-base text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/35"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%234E8F01' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",
            backgroundPosition: 'right 1rem center',
          }}
        >
          <option value="">Select your state…</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
        {errors.stateOfPlayCode && <FieldError message={errors.stateOfPlayCode.message} />}
        <p className="mt-2 text-xs leading-relaxed text-slate-500">This is required for lottery board reporting. You can&apos;t change it after purchase.</p>
      </Card>

      <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Payment method</p>
        <p className="mb-3 block text-sm font-black text-navy-950">Pay with</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {paymentMethods.map((m) => {
            const isSelected = paymentMethod === m.id;
            return (
              <label key={m.id} className={isSelected ? 'flex cursor-pointer items-start gap-3 rounded-sm border-2 border-navy-700 bg-amber-50 p-3 sm:p-4' : 'flex cursor-pointer items-start gap-3 rounded-sm border border-slate-200 bg-white p-3 transition hover:border-amber-500 sm:p-4'}>
                <input type="radio" value={m.id} {...register('paymentMethod')} className="mt-1 h-4 w-4 shrink-0 accent-navy-700" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-black text-navy-950">{m.label}</span>
                  <span className="text-xs text-slate-500">{m.sublabel}</span>
                </div>
              </label>
            );
          })}
        </div>
        {errors.paymentMethod && <FieldError message={errors.paymentMethod.message} />}
      </Card>

      <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" {...register('ageConfirmed')} className="mt-1 h-4 w-4 accent-navy-700" />
          <span className="text-sm leading-relaxed text-slate-700">
            I confirm I am 18 years or older and I accept the{' '}
            <a href="/terms" className="font-bold text-navy-700 underline" target="_blank">raffle rules</a>{' '}
            and{' '}
            <a href="/privacy" className="font-bold text-navy-700 underline" target="_blank">privacy policy</a>.
          </span>
        </label>
        {errors.ageConfirmed && <FieldError message={errors.ageConfirmed.message} />}
        {submitError && (
          <div className="mt-4 flex items-start gap-2 rounded-sm border border-red-100 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm leading-relaxed text-slate-700">{submitError}</p>
          </div>
        )}
        <Button type="submit" variant="accent" size="lg" fullWidth isLoading={isSubmitting} className="mt-5 rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400">
          {isSubmitting ? 'Starting payment…' : `Continue to payment of ${formatNaira(safeQuantity * draw.ticketPriceNgn)}`}
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3 w-3 text-navy-700" />
          Payment is processed by your gateway. We never store card details.
        </p>
      </Card>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="mt-2 flex items-start gap-1 text-xs text-red-600">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}

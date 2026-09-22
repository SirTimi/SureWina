'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Lock,
  Mail,
  Minus,
  Phone,
  Plus,
  WalletCards,
} from 'lucide-react';

import { Button, Card } from '@surewina/ui';
import {
  formatNaira,
  getAllStatesSorted,
} from '@surewina/utils';

import type { DrawPublic } from '@surewina/types';
import type { WalletView } from '@surewina/api-client';

import { api } from '@/lib/api';
import { isSignedIn } from '@/lib/auth';

import {
  purchaseSchema,
  type PurchaseFormParsed,
  type PurchaseFormValues,
} from '@/lib/schemas';

import {
  getFreeJackpotEntriesFromRegularTickets,
  getTicketsToNextFreeJackpotEntry,
} from '@surewina/types';

interface BuyFormProps {
  draw: DrawPublic;
  initialQuantity: number;
}

export function BuyForm({
  draw,
  initialQuantity,
}: BuyFormProps) {
  const router = useRouter();

  const states =
    getAllStatesSorted();

  const [
    submitError,
    setSubmitError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<'PAYSTACK' | 'WALLET'>(
      'PAYSTACK',
    );

  const [
    signedIn,
    setSignedIn,
  ] =
    useState(false);

  const [
    wallet,
    setWallet,
  ] =
    useState<WalletView | null>(
      null,
    );

  const [
    walletLoading,
    setWalletLoading,
  ] =
    useState(false);

  const [
    accountPhone,
    setAccountPhone,
  ] =
    useState<string | null>(
      null,
    );

  const [
    accountEmail,
    setAccountEmail,
  ] =
    useState<string | null>(
      null,
    );

  const walletPurchaseAttempt =
    useRef<{
      signature: string;
      key: string;
    } | null>(
      null,
    );

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<
    PurchaseFormValues,
    unknown,
    PurchaseFormParsed
  >({
    resolver:
      zodResolver(
        purchaseSchema,
      ),

    defaultValues: {
      quantity:
        initialQuantity,

      phone:
        '',

      email:
        '',

      stateOfPlayCode:
        '',

      ageConfirmed:
        false,
    },
  });

  const quantity =
    watch('quantity');

  const totalAmountNgn =
    (quantity ?? 1) *
    draw.ticketPriceNgn;

  const walletHasEnough =
    wallet !== null &&
    wallet.status === 'ACTIVE' &&
    wallet.availableNgn >= totalAmountNgn;

  useEffect(() => {
    const hasSession =
      isSignedIn();

    setSignedIn(
      hasSession,
    );

    if (!hasSession) {
      return;
    }

    setWalletLoading(
      true,
    );

    void Promise.all([
      api.auth.getMe(),
      api.wallet.getMine(),
    ])
      .then(
        ([
          user,
          walletResult,
        ]) => {
          setAccountPhone(
            user.phoneNumber,
          );

          setAccountEmail(
            user.email ?? null,
          );

          setWallet(
            walletResult,
          );

          if (
            !getValues(
              'phone',
            )
          ) {
            setValue(
              'phone',
              phoneInputValue(
                user.phoneNumber,
              ),
            );
          }

          if (
            user.email &&
            !getValues(
              'email',
            )
          ) {
            setValue(
              'email',
              user.email,
            );
          }
        },
      )
      .catch(
        () => {
          setWallet(
            null,
          );
        },
      )
      .finally(
        () =>
          setWalletLoading(
            false,
          ),
      );
  }, [
    getValues,
    setValue,
  ]);

  const selectWalletPayment =
    () => {
      if (
        !signedIn
      ) {
        return;
      }

      if (
        accountPhone
      ) {
        setValue(
          'phone',
          phoneInputValue(
            accountPhone,
          ),
          {
            shouldValidate:
              true,
          },
        );
      }

      if (
        accountEmail
      ) {
        setValue(
          'email',
          accountEmail,
          {
            shouldValidate:
              true,
          },
        );
      }

      setPaymentMethod(
        'WALLET',
      );

      setSubmitError(
        null,
      );
    };

  const isJackpotPurchase =
    draw.drawType ===
    'SATURDAY_JACKPOT';

  const freeJackpotEntries =
    getFreeJackpotEntriesFromRegularTickets(
      quantity ?? 0,
    );

  const ticketsToNextJackpotEntry =
    getTicketsToNextFreeJackpotEntry(
      quantity ?? 0,
    );

  const adjustQuantity = (
    delta: number,
  ) => {
    const next =
      Math.max(
        1,
        Math.min(
          100,
          (quantity ?? 1) +
            delta,
        ),
      );

    setValue(
      'quantity',
      next,
      {
        shouldValidate:
          true,
      },
    );
  };

  const onSubmit: SubmitHandler<
    PurchaseFormParsed
  > = async (
    data,
  ) => {
    setSubmitError(
      null,
    );

    try {
      if (
        paymentMethod ===
        'WALLET'
      ) {
        if (
          !signedIn
        ) {
          setSubmitError(
            'Sign in to pay from your SureWina wallet.',
          );

          return;
        }

        if (
          !wallet ||
          wallet.status !==
            'ACTIVE'
        ) {
          setSubmitError(
            'Your wallet is not available for purchases right now.',
          );

          return;
        }

        if (
          wallet.availableNgn <
          totalAmountNgn
        ) {
          setSubmitError(
            `Your wallet balance is too low for this purchase. You need ${formatNaira(
              totalAmountNgn,
            )} and currently have ${formatNaira(
              wallet.availableNgn,
            )}.`,
          );

          return;
        }

        const purchaseSignature =
          `${draw.drawCode}|${data.quantity}|${data.stateOfPlayCode}`;

        if (
          !walletPurchaseAttempt.current ||
          walletPurchaseAttempt.current.signature !==
            purchaseSignature
        ) {
          walletPurchaseAttempt.current =
            {
              signature:
                purchaseSignature,

              key:
                `wallet-purchase-${crypto.randomUUID()}`,
            };
        }

        const result =
          await api.wallet.purchaseTickets(
            {
              drawCode:
                draw.drawCode,

              quantity:
                data.quantity,

              stateOfPlayCode:
                data.stateOfPlayCode,

              idempotencyKey:
                walletPurchaseAttempt.current.key,
            },
          );

        const params =
          new URLSearchParams(
            {
              refs:
                result.ticketRefs.join(
                  ',',
                ),

              draw:
                result.drawCode,

              phone:
                accountPhone ??
                data.phone,

              paid:
                String(
                  result.amountNgn,
                ),

              scheduled:
                result.drawScheduledAt,

              newEntries:
                String(
                  result.jackpotMinted
                    ?.entriesMinted ??
                    0,
                ),

              cumCount:
                '0',

              toNext:
                '0',
            },
          );

        router.push(
          `/tickets/confirmation?${params.toString()}`,
        );

        return;
      }

      const result =
        await api.tickets.initiatePurchase(
          {
            drawCode:
              draw.drawCode,

            quantity:
              data.quantity,

            phoneE164:
              data.phone,

            stateOfPlayCode:
              data.stateOfPlayCode,

            // Omitted entirely when blank.
            // An empty string fails @IsEmail on the API.
            ...(data.email
              ? {
                  buyerEmail:
                    data.email,
                }
              : {}),
          },
        );

      router.push(
        result.redirectUrl,
      );
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : paymentMethod ===
              'WALLET'
            ? 'Could not complete the wallet purchase. Your balance was not charged unless the purchase completed.'
            : 'Could not start your purchase. Try again or contact support.',
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit(
        onSubmit,
      )}
      className="space-y-5"
    >
      <Card
        variant="default"
        className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
          Ticket quantity
        </p>

        <label
          htmlFor="quantity"
          className="mb-3 block text-sm font-black text-navy-950"
        >
          How many tickets?
        </label>

        <div className="flex max-w-xs overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          <button
            type="button"
            onClick={() =>
              adjustQuantity(
                -1,
              )
            }
            className="px-4 text-navy-700 transition hover:bg-amber-50 disabled:opacity-50"
            disabled={
              quantity <= 1
            }
            aria-label="Decrease"
          >
            <Minus className="h-4 w-4" />
          </button>

          <input
            id="quantity"
            type="number"
            {...register(
              'quantity',
              {
                valueAsNumber:
                  true,
              },
            )}
            className="h-12 flex-1 bg-white text-center font-display text-xl font-black tabular-nums text-navy-950 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            min={1}
            max={100}
          />

          <button
            type="button"
            onClick={() =>
              adjustQuantity(
                1,
              )
            }
            className="px-4 text-navy-700 transition hover:bg-amber-50 disabled:opacity-50"
            disabled={
              quantity >= 100
            }
            aria-label="Increase"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {errors.quantity && (
          <FieldError
            message={
              errors
                .quantity
                .message
            }
          />
        )}

        {!isJackpotPurchase &&
          quantity >= 1 && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-sm font-bold text-navy-950">
                {freeJackpotEntries >
                0
                  ? `${freeJackpotEntries} free Sure Jackpot ${
                      freeJackpotEntries ===
                      1
                        ? 'entry'
                        : 'entries'
                    } unlocked with this purchase.`
                  : `${ticketsToNextJackpotEntry} more regular ticket${
                      ticketsToNextJackpotEntry ===
                      1
                        ? ''
                        : 's'
                    } to unlock 1 free Sure Jackpot entry.`}
              </p>

              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Every 10 regular
                ₦500 tickets gives
                the customer 1 free
                entry into the
                coming Saturday
                jackpot draw.
              </p>
            </div>
          )}

        {isJackpotPurchase && (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-bold text-navy-950">
              This is a direct
              Sure Jackpot ticket.
            </p>

            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Jackpot tickets
              bought directly go
              straight into the
              coming Saturday
              jackpot draw bucket.
            </p>
          </div>
        )}
      </Card>

      <Card
        variant="default"
        className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
          Buyer details
        </p>

        <label
          htmlFor="phone"
          className="mb-3 block text-sm font-black text-navy-950"
        >
          Phone number
        </label>

        <div className="flex max-w-md overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          <span className="inline-flex items-center border-r border-slate-200 bg-[#F8FAF4] px-3 font-mono text-xs font-bold text-navy-700">
            NG +234
          </span>

          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700" />

            <input
              id="phone"
              type="tel"
              {...register(
                'phone',
              )}
              placeholder="803 123 4567"
              className="h-12 w-full bg-white pl-10 pr-3 text-base text-navy-950 outline-none placeholder:text-slate-400"
              autoComplete="tel-national"
            />
          </div>
        </div>

        {errors.phone && (
          <FieldError
            message={
              errors.phone
                .message
            }
          />
        )}

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Your ticket reference
          goes here by SMS within
          30 seconds. We never
          share your number.
        </p>

        <label
          htmlFor="email"
          className="mb-3 mt-5 block text-sm font-black text-navy-950"
        >
          Email{' '}
          <span className="font-medium text-slate-400">
            (optional)
          </span>
        </label>

        <div className="flex max-w-md overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700" />

            <input
              id="email"
              type="email"
              {...register(
                'email',
              )}
              placeholder="you@example.com"
              className="h-12 w-full bg-white pl-10 pr-3 text-base text-navy-950 outline-none placeholder:text-slate-400"
              autoComplete="email"
            />
          </div>
        </div>

        {errors.email && (
          <FieldError
            message={
              errors.email
                .message
            }
          />
        )}

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          We&apos;ll email your
          ticket with a link to
          print it. You can also
          use this email to sign
          in if the SMS code
          doesn&apos;t arrive.
        </p>
      </Card>

      <Card
        variant="default"
        className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
          Regulatory info
        </p>

        <label
          htmlFor="stateOfPlayCode"
          className="mb-3 block text-sm font-black text-navy-950"
        >
          State of play
        </label>

        <select
          id="stateOfPlayCode"
          {...register(
            'stateOfPlayCode',
          )}
          className="h-12 w-full max-w-md appearance-none rounded-sm border border-slate-200 bg-white bg-no-repeat px-3 pr-10 text-base text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/35"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%234E8F01' stroke-width='1.5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",

            backgroundPosition:
              'right 1rem center',
          }}
        >
          <option value="">
            Select your state…
          </option>

          {states.map(
            (state) => (
              <option
                key={
                  state.code
                }
                value={
                  state.code
                }
              >
                {state.name}
              </option>
            ),
          )}
        </select>

        {errors.stateOfPlayCode && (
          <FieldError
            message={
              errors
                .stateOfPlayCode
                .message
            }
          />
        )}

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          This is required for
          lottery board reporting.
          You can&apos;t change it
          after purchase.
        </p>
      </Card>

      <Card
        variant="default"
        className="rounded-3xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6"
      >
        <p className="mb-5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
          Payment
        </p>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => {
              setPaymentMethod(
                'PAYSTACK',
              );

              setSubmitError(
                null,
              );
            }}
            className={
              paymentMethod ===
              'PAYSTACK'
                ? 'rounded-sm border border-navy-700 bg-navy-50 p-4 text-left ring-2 ring-amber-400/25'
                : 'rounded-sm border border-slate-200 bg-[#F8FAF4] p-4 text-left transition hover:bg-white'
            }
          >
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-navy-950">
                      Pay online with Paystack
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Continue to Paystack and use the payment methods available there.
                    </p>
                  </div>

                  <PaymentRadio
                    selected={
                      paymentMethod ===
                      'PAYSTACK'
                    }
                  />
                </div>
              </div>
            </div>
          </button>

          {signedIn ? (
            <>
              <button
              type="button"
              onClick={
                selectWalletPayment
              }
              className={
                paymentMethod ===
                'WALLET'
                  ? 'rounded-sm border border-navy-700 bg-navy-50 p-4 text-left ring-2 ring-amber-400/25'
                  : 'rounded-sm border border-slate-200 bg-white p-4 text-left transition hover:bg-[#F8FAF4]'
              }
            >
              <div className="flex items-start gap-3">
                <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-navy-950">
                        Pay from SureWina wallet
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {walletLoading
                          ? 'Loading your wallet balance…'
                          : wallet
                            ? `Available balance: ${formatNaira(
                                wallet.availableNgn,
                              )}`
                            : 'Your wallet balance could not be loaded.'}
                      </p>
                    </div>

                    <PaymentRadio
                      selected={
                        paymentMethod ===
                        'WALLET'
                      }
                    />
                  </div>

                  {!walletLoading &&
                    wallet &&
                    !walletHasEnough && (
                      <div className="mt-3 rounded-sm border border-amber-100 bg-amber-50 p-3">
                        <p className="text-xs font-bold text-amber-800">
                          {wallet.status !==
                          'ACTIVE'
                            ? `Wallet is ${wallet.status.toLowerCase()} and cannot be used for purchases.`
                            : `You need ${formatNaira(
                                totalAmountNgn -
                                  wallet.availableNgn,
                              )} more for this purchase.`}
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-600">
                          Top up before choosing wallet payment.
                        </p>
                      </div>
                    )}
                </div>
              </div>
            </button>

            {!walletLoading &&
              wallet &&
              !walletHasEnough && (
                <Link
                  href="/dashboard/wallet"
                  className="inline-flex w-fit text-xs font-black text-navy-700 underline"
                >
                  Top up wallet
                </Link>
              )}
            </>
          ) : (
            <div className="rounded-sm border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />

                <div>
                  <p className="text-sm font-black text-navy-950">
                    Have a SureWina wallet?
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Sign in to use your wallet balance for this ticket purchase.
                  </p>

                  <Link
                    href={`/sign-in?next=${encodeURIComponent(
                      `/draws/${draw.drawCode}/buy?qty=${quantity ?? 1}`,
                    )}`}
                    className="mt-2 inline-flex text-xs font-black text-navy-700 underline"
                  >
                    Sign in to use wallet
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        variant="default"
        className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            {...register(
              'ageConfirmed',
            )}
            className="mt-1 h-4 w-4 accent-navy-700"
          />

          <span className="text-sm leading-relaxed text-slate-700">
            I confirm I am 18
            years or older and I
            accept the{' '}
            <a
              href="/terms"
              className="font-bold text-navy-700 underline"
              target="_blank"
            >
              raffle rules
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              className="font-bold text-navy-700 underline"
              target="_blank"
            >
              privacy policy
            </a>
            .
          </span>
        </label>

        {errors.ageConfirmed && (
          <FieldError
            message={
              errors
                .ageConfirmed
                .message
            }
          />
        )}

        {submitError && (
          <div className="mt-4 flex items-start gap-2 rounded-sm border border-red-100 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />

            <p className="text-sm leading-relaxed text-slate-700">
              {submitError}
            </p>
          </div>
        )}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          isLoading={
            isSubmitting
          }
          disabled={
            isSubmitting ||
            (paymentMethod ===
              'WALLET' &&
              (!walletHasEnough ||
                walletLoading))
          }
          className="mt-5 rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          {isSubmitting
            ? paymentMethod ===
              'WALLET'
              ? 'Buying with wallet…'
              : 'Starting payment…'
            : paymentMethod ===
                'WALLET'
              ? `Pay ${formatNaira(
                  totalAmountNgn,
                )} from wallet`
              : `Continue to Paystack for ${formatNaira(
                  totalAmountNgn,
                )}`}
        </Button>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          {paymentMethod ===
          'WALLET' ? (
            <>
              <WalletCards className="h-3 w-3 text-navy-700" />
              Wallet purchases are issued immediately after the ledger debit completes.
            </>
          ) : (
            <>
              <Lock className="h-3 w-3 text-navy-700" />
              Payment is processed securely by Paystack. We never store card details.
            </>
          )}
        </p>
      </Card>
    </form>
  );
}

function FieldError({
  message,
}: {
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-2 flex items-start gap-1 text-xs text-red-600">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />

      {message}
    </p>
  );
}
function PaymentRadio({
  selected,
}: {
  selected: boolean;
}) {
  return (
    <span
      className={
        selected
          ? 'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-4 border-navy-700 bg-white'
          : 'mt-0.5 h-4 w-4 shrink-0 rounded-full border border-slate-300 bg-white'
      }
      aria-hidden="true"
    />
  );
}

function phoneInputValue(
  phoneE164: string,
) {
  if (
    phoneE164.startsWith(
      '+234',
    )
  ) {
    return phoneE164.slice(
      4,
    );
  }

  return phoneE164;
}

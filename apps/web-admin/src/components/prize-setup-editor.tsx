'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type {
  AdminPoolRevenueBasis,
  AdminPrizeModel,
  AdminPrizePlan,
  AdminPrizePreview,
  AdminPrizeSetup,
  AdminPrizeTier,
} from '@surewina/api-client';
import { api } from '@/lib/api';

// The prize part of the draw setup page: a single prize, a prize pool split
// into up to three categories, or up to three jackpot stages. The preview
// is worked out by the API with the same arithmetic the draw engine uses.

export type TierForm = {
  tierNo: number;
  name: string;
  active: boolean;
  sharePct: string;
  winners: string;
  prize: string;
  description: string;
  // Jackpot stages: the prize is the item in description; prize is its cash value.
  item: boolean;
};

export type PrizeSetupForm = {
  model: AdminPrizeModel;
  payoutPct: string;
  minimumNgn: string;
  basis: AdminPoolRevenueBasis;
  tiers: TierForm[];
};

// Placeholder values until the business confirms the real ones.
export function defaultPrizeSetup(model: AdminPrizeModel): PrizeSetupForm {
  if (model === 'STAGES') {
    return {
      model,
      payoutPct: '',
      minimumNgn: '',
      basis: 'GROSS',
      tiers: [
        { tierNo: 1, name: 'Jackpot', active: true, sharePct: '', winners: '1', prize: '4000000', description: '', item: false },
        { tierNo: 2, name: 'Consolation', active: true, sharePct: '', winners: '5', prize: '50000', description: '', item: false },
        { tierNo: 3, name: 'Second consolation', active: false, sharePct: '', winners: '10', prize: '10000', description: '', item: false },
      ],
    };
  }
  return {
    model,
    payoutPct: '50',
    minimumNgn: '500000',
    basis: 'GROSS',
    tiers: [
      { tierNo: 1, name: 'Category 1', active: true, sharePct: '10', winners: '', prize: '50000', description: '', item: false },
      { tierNo: 2, name: 'Category 2', active: true, sharePct: '20', winners: '', prize: '10000', description: '', item: false },
      { tierNo: 3, name: 'Category 3', active: true, sharePct: '30', winners: '', prize: '2000', description: '', item: false },
      { tierNo: 4, name: 'Category 4', active: true, sharePct: '40', winners: '', prize: '500', description: '', item: false },
    ],
  };
}

// The form as saved on a draw.
export function prizeSetupFromDraw(draw: {
  prizeModel: AdminPrizeModel;
  poolPayoutBp: number | null;
  poolMinimumNgn: number | null;
  poolRevenueBasis: AdminPoolRevenueBasis | null;
  tiers: AdminPrizeTier[];
}): PrizeSetupForm {
  if (draw.prizeModel === 'SINGLE') return { ...defaultPrizeSetup('POOL'), model: 'SINGLE' };
  const fallback = defaultPrizeSetup(draw.prizeModel);
  return {
    model: draw.prizeModel,
    payoutPct: draw.poolPayoutBp != null ? bpToPct(draw.poolPayoutBp) : fallback.payoutPct,
    minimumNgn: draw.poolMinimumNgn != null ? String(draw.poolMinimumNgn) : fallback.minimumNgn,
    basis: draw.poolRevenueBasis ?? 'GROSS',
    tiers: (draw.prizeModel === 'POOL' ? [1, 2, 3, 4] : [1, 2, 3]).map((n) => {
      const t = draw.tiers.find((x) => x.tierNo === n);
      if (!t) return { ...fallback.tiers[n - 1], active: false };
      return {
        tierNo: n,
        name: t.name,
        active: t.active,
        sharePct: t.allocationBp != null ? bpToPct(t.allocationBp) : '',
        winners: t.winnerCount != null ? String(t.winnerCount) : '',
        prize: String(t.prizePerWinnerNgn),
        description: t.prizeDescription ?? '',
        item: !!t.itemPrize,
      };
    }),
  };
}

// Turns the form into the request fields, or lists what is wrong with it.
export function prizeSetupPayload(form: PrizeSetupForm): { payload: AdminPrizeSetup; errors: string[] } {
  if (form.model === 'SINGLE') return { payload: { prizeModel: 'SINGLE' }, errors: [] };

  const errors: string[] = [];
  const tiers: AdminPrizeTier[] = form.tiers.map((t) => {
    const prize = wholeNaira(t.prize);
    if (prize == null || prize < 1) errors.push(`${label(form.model, t.tierNo)}: enter a prize per winner of at least ₦1`);
    const tier: AdminPrizeTier = {
      tierNo: t.tierNo,
      name: t.name.trim(),
      active: t.active,
      prizePerWinnerNgn: prize ?? 0,
      prizeDescription: t.description.trim() || null,
      ...(form.model === 'STAGES' ? { itemPrize: t.item } : {}),
    };
    if (form.model === 'STAGES' && t.active && t.item && !t.description.trim()) {
      errors.push(`${label(form.model, t.tierNo)}: name the item; the prize amount is its cash value`);
    }
    if (form.model === 'POOL') {
      const bp = pctToBp(t.sharePct);
      if (t.active && bp == null) errors.push(`${label(form.model, t.tierNo)}: enter a share of the pool, up to two decimal places`);
      tier.allocationBp = bp;
    } else {
      const winners = wholeNaira(t.winners);
      if (t.active && (winners == null || winners < 1)) errors.push(`${label(form.model, t.tierNo)}: enter how many winners`);
      tier.winnerCount = winners;
    }
    return tier;
  });

  if (form.model === 'STAGES') {
    return { payload: { prizeModel: 'STAGES', tiers }, errors };
  }

  const payoutBp = pctToBp(form.payoutPct);
  const minimum = wholeNaira(form.minimumNgn);
  if (payoutBp == null) errors.push('Enter a payout ratio, up to two decimal places');
  if (minimum == null) errors.push('Enter a minimum prize pool in whole naira');

  return {
    payload: {
      prizeModel: 'POOL',
      poolPayoutBp: payoutBp ?? undefined,
      poolMinimumNgn: minimum ?? undefined,
      poolRevenueBasis: form.basis,
      tiers,
    },
    errors,
  };
}

export function PrizeSetupEditor({
  value,
  onChange,
  drawId,
  ticketPriceNgn,
  locked,
  fixedModel,
}: {
  value: PrizeSetupForm;
  onChange: (next: PrizeSetupForm) => void;
  drawId?: string;
  ticketPriceNgn: number;
  locked?: boolean;
  // Products: the model follows the product (daily pool or jackpot stages).
  fixedModel?: boolean;
}) {
  const set = (patch: Partial<PrizeSetupForm>) => onChange({ ...value, ...patch });
  const setTier = (tierNo: number, patch: Partial<TierForm>) =>
    onChange({ ...value, tiers: value.tiers.map((t) => (t.tierNo === tierNo ? { ...t, ...patch } : t)) });

  const shareTotalBp = value.tiers
    .filter((t) => t.active)
    .reduce((sum, t) => sum + (pctToBp(t.sharePct) ?? 0), 0);

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          Sales have opened, so the prize setup is locked. It pays out exactly what buyers were shown.
        </div>
      )}

      {!fixedModel && (
      <div>
        <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">How prizes work</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ['SINGLE', 'Single prize', 'One winner wins the prize value'],
              ['POOL', 'Prize pool', 'A share of sales, split into categories'],
              ['STAGES', 'Jackpot stages', 'Main jackpot plus consolation stages'],
            ] as [AdminPrizeModel, string, string][]
          ).map(([m, title, hint]) => (
            <button
              key={m}
              type="button"
              disabled={locked}
              onClick={() => onChange(m === 'SINGLE' ? { ...value, model: 'SINGLE' } : value.model === m ? value : defaultPrizeSetup(m))}
              className={
                value.model === m
                  ? 'rounded-lg border-2 border-navy-700 bg-navy-50 p-3 text-left'
                  : 'rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300 disabled:opacity-60'
              }
            >
              <span className="block text-sm font-black text-[#0B1220]">{title}</span>
              <span className="mt-1 block text-xs text-slate-500">{hint}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {value.model === 'POOL' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Payout ratio (%)" hint="of eligible revenue">
            <input
              inputMode="decimal"
              disabled={locked}
              value={value.payoutPct}
              onChange={(e) => set({ payoutPct: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Minimum pool (₦)" hint={formatOrBlank(value.minimumNgn)}>
            <input
              inputMode="numeric"
              disabled={locked}
              value={value.minimumNgn}
              onChange={(e) => set({ minimumNgn: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Revenue counted">
            <select
              disabled={locked}
              value={value.basis}
              onChange={(e) => set({ basis: e.target.value as AdminPoolRevenueBasis })}
              className={inputClass}
            >
              <option value="GROSS">All ticket sales</option>
              <option value="NET_OF_COMMISSION">Sales less agent commission</option>
            </select>
          </Field>
        </div>
      )}

      {value.model !== 'SINGLE' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">On</th>
                <th className="px-3 py-2">{value.model === 'POOL' ? 'Category' : 'Stage'}</th>
                <th className="px-3 py-2">{value.model === 'POOL' ? 'Share of pool (%)' : 'Winners'}</th>
                <th className="px-3 py-2">{value.model === 'STAGES' ? 'Prize or cash value (₦)' : 'Prize per winner (₦)'}</th>
                {value.model === 'STAGES' && <th className="px-3 py-2">Item</th>}
                <th className="px-3 py-2">{value.model === 'STAGES' ? 'Item name / prize shown' : 'Prize shown (optional)'}</th>
              </tr>
            </thead>
            <tbody>
              {value.tiers.map((t) => (
                <tr key={t.tierNo} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${label(value.model, t.tierNo)} active`}
                      disabled={locked || (value.model === 'STAGES' && t.tierNo === 1)}
                      checked={t.active}
                      onChange={(e) => setTier(t.tierNo, { active: e.target.checked })}
                      className="mt-3 h-4 w-4"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      disabled={locked}
                      maxLength={60}
                      value={t.name}
                      onChange={(e) => setTier(t.tierNo, { name: e.target.value })}
                      className={inputClass}
                    />
                    <span className="mt-1 block text-xs text-slate-400">{label(value.model, t.tierNo)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {value.model === 'POOL' ? (
                      <input
                        inputMode="decimal"
                        disabled={locked || !t.active}
                        value={t.sharePct}
                        onChange={(e) => setTier(t.tierNo, { sharePct: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <input
                        inputMode="numeric"
                        disabled={locked || !t.active}
                        value={t.winners}
                        onChange={(e) => setTier(t.tierNo, { winners: e.target.value })}
                        className={inputClass}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      disabled={locked}
                      value={t.prize}
                      onChange={(e) => setTier(t.tierNo, { prize: e.target.value })}
                      className={inputClass}
                    />
                    <span className="mt-1 block text-xs text-slate-400">{formatOrBlank(t.prize)}</span>
                  </td>
                  {value.model === 'STAGES' && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${label(value.model, t.tierNo)} is an item prize`}
                        disabled={locked || !t.active}
                        checked={t.item}
                        onChange={(e) => setTier(t.tierNo, { item: e.target.checked })}
                        className="mt-3 h-4 w-4"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <input
                      disabled={locked}
                      maxLength={200}
                      placeholder={value.model === 'STAGES' && t.item ? 'e.g. Toyota Corolla' : 'e.g. ₦50,000 cash'}
                      value={t.description}
                      onChange={(e) => setTier(t.tierNo, { description: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {value.model === 'POOL' && (
            <div
              className={`flex items-center gap-2 border-t px-3 py-2 text-sm font-bold ${
                shareTotalBp === 10000 ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'
              }`}
            >
              {shareTotalBp === 10000 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Shares add up to {bpToPct(shareTotalBp)}%{shareTotalBp === 10000 ? '' : ' (they must add up to exactly 100%)'}
            </div>
          )}
        </div>
      )}

      {value.model !== 'SINGLE' && <PrizePreviewPanel form={value} drawId={drawId} ticketPriceNgn={ticketPriceNgn} />}
    </div>
  );
}

function PrizePreviewPanel({ form, drawId, ticketPriceNgn }: { form: PrizeSetupForm; drawId?: string; ticketPriceNgn: number }) {
  const { payload, errors: localErrors } = useMemo(() => prizeSetupPayload(form), [form]);
  const [preview, setPreview] = useState<AdminPrizePreview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const revenues = useMemo(() => {
    if (payload.prizeModel !== 'POOL' || !payload.poolPayoutBp) return [0];
    const breakEven = Math.ceil(((payload.poolMinimumNgn ?? 0) * 10000) / payload.poolPayoutBp);
    const base = breakEven > 0 ? breakEven : Math.max(1, ticketPriceNgn) * 1000;
    return [Math.round(base / 2), base, base * 2, base * 4];
  }, [payload, ticketPriceNgn]);

  const key = JSON.stringify({ payload, revenues, drawId });

  useEffect(() => {
    if (localErrors.length > 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.admin
        .prizePreview({
          prizeModel: payload.prizeModel as 'POOL' | 'STAGES',
          poolPayoutBp: payload.poolPayoutBp,
          poolMinimumNgn: payload.poolMinimumNgn,
          tiers: payload.tiers ?? [],
          revenuesNgn: revenues,
          ...(drawId ? { drawId } : {}),
        })
        .then((p) => {
          if (!cancelled) {
            setPreview(p);
            setFailed(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setFailed(err instanceof Error ? err.message : 'Preview unavailable');
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // key captures every input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const problems = localErrors.length > 0 ? localErrors : preview && !preview.valid ? preview.errors : [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-black text-[#0B1220]">What this pays</h3>
        <p className="text-xs text-slate-500">
          Worked out with the draw engine&apos;s own arithmetic. Whole winners only; whatever is left over stays with the company.
        </p>
      </div>

      {problems.length > 0 ? (
        <ul className="space-y-1 px-4 py-3 text-sm text-amber-700">
          {problems.map((p) => (
            <li key={p} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      ) : failed ? (
        <p className="px-4 py-3 text-sm text-red-700">{failed}</p>
      ) : !preview ? (
        <p className="px-4 py-3 text-sm text-slate-500">Working it out…</p>
      ) : form.model === 'STAGES' ? (
        <PlanTable plan={preview.scenarios[0]} />
      ) : (
        <div className="space-y-4 px-4 py-3">
          {preview.breakEvenRevenueNgn != null && (
            <p className="text-sm text-slate-600">
              Below {formatNaira(preview.breakEvenRevenueNgn)} of eligible revenue the company tops the pool up to the minimum.
            </p>
          )}
          {preview.current && (
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                At sales so far ({preview.current.ticketsSold.toLocaleString('en-NG')} tickets, {formatNaira(preview.current.eligibleRevenueNgn)} gross)
              </p>
              <PlanTable plan={preview.current.plan} />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Eligible revenue</th>
                  <th className="py-1 pr-3">Pool</th>
                  <th className="py-1 pr-3">Company top-up</th>
                  {preview.scenarios[0]?.tiers.map((t) => (
                    <th key={t.tierNo} className="py-1 pr-3">{t.name}</th>
                  ))}
                  <th className="py-1 pr-3">Paid out</th>
                  <th className="py-1">Kept (rounding)</th>
                </tr>
              </thead>
              <tbody>
                {preview.scenarios.map((p) => (
                  <tr key={p.eligibleRevenueNgn} className="border-t border-slate-100 font-mono">
                    <td className="py-1.5 pr-3">{formatNaira(p.eligibleRevenueNgn ?? 0)}</td>
                    <td className="py-1.5 pr-3">{formatNaira(p.poolNgn ?? 0)}</td>
                    <td className="py-1.5 pr-3">{p.fundingShortfallNgn > 0 ? formatNaira(p.fundingShortfallNgn) : '—'}</td>
                    {p.tiers.map((t) => (
                      <td key={t.tierNo} className="py-1.5 pr-3">{t.winners.toLocaleString('en-NG')} winners</td>
                    ))}
                    <td className="py-1.5 pr-3">{formatNaira(p.totalPrizeNgn)}</td>
                    <td className="py-1.5">{formatNaira(p.roundingNgn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            If fewer tickets are sold than there are prizes, the prizes nobody could win stay with the company and are recorded in the uncollected prizes ledger.
          </p>
        </div>
      )}
    </div>
  );
}

function PlanTable({ plan }: { plan: AdminPrizePlan | undefined }) {
  if (!plan) return null;
  return (
    <div className="overflow-x-auto px-4 py-3">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 pr-3">{plan.model === 'POOL' ? 'Category' : 'Stage'}</th>
            <th className="py-1 pr-3">Winners</th>
            <th className="py-1 pr-3">Each wins</th>
            <th className="py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {plan.tiers.map((t) => (
            <tr key={t.tierNo} className="border-t border-slate-100">
              <td className="py-1.5 pr-3 font-bold">{t.name}</td>
              <td className="py-1.5 pr-3 font-mono">{t.winners.toLocaleString('en-NG')}</td>
              <td className="py-1.5 pr-3">{t.prizeDescription}</td>
              <td className="py-1.5 font-mono">{formatNaira(t.winners * t.prizePerWinnerNgn)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 font-black">
            <td className="py-1.5 pr-3">Total</td>
            <td className="py-1.5 pr-3 font-mono">{plan.totalWinners.toLocaleString('en-NG')}</td>
            <td />
            <td className="py-1.5 font-mono">{formatNaira(plan.totalPrizeNgn)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Field({ label: text, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">
        {text}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-navy-700 disabled:bg-slate-50 disabled:text-slate-400';

function label(model: AdminPrizeModel, tierNo: number): string {
  if (model === 'STAGES') return tierNo === 1 ? 'Stage 1 (main jackpot)' : `Stage ${tierNo} (consolation)`;
  return `Category ${tierNo}`;
}

// "12.5" → 1250. Null unless a number from 0.01 to 100 with at most two decimals.
function pctToBp(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return bp >= 1 && bp <= 10000 ? bp : null;
}

function bpToPct(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

function wholeNaira(text: string): number | null {
  const t = text.replace(/[,\s₦]/g, '');
  if (!/^\d{1,12}$/.test(t)) return null;
  return Number(t);
}

function formatOrBlank(text: string): string | undefined {
  const n = wholeNaira(text);
  return n == null ? undefined : formatNaira(n);
}

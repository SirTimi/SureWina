'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Pencil, Plus, Power, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawTemplate, AdminProduct, AdminProductTerms } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import {
  PrizeSetupEditor,
  defaultPrizeSetup,
  prizeSetupFromDraw,
  prizeSetupPayload,
  type PrizeSetupForm,
} from '@/components/prize-setup-editor';
import { api } from '@/lib/api';

// Products (daily games and jackpot games) and when their draws run.
// Every change waits for approval by a different, senior admin.

type Kind = 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProductsPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [templates, setTemplates] = useState<AdminDrawTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ product: AdminProduct | null; kind: Kind } | null>(null);
  const [scheduling, setScheduling] = useState<AdminProduct | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.admin.listProducts(), api.admin.listDrawTemplates()])
      .then(([p, t]) => {
        setProducts(p.products);
        setTemplates(t.templates);
        setError(null);
      })
      .catch((e) => setError(message(e, 'Could not load products.')))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      load();
    } catch (e) {
      setError(message(e, 'That did not work.'));
    }
  };

  const daily = products.filter((p) => p.kind === 'DAILY_STANDARD');
  const jackpot = products.filter((p) => p.kind === 'SATURDAY_JACKPOT');

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="Products"
        description="The games players buy: their ticket price, prize pool or jackpot stages, and when their draws run. Changes take effect only after a different senior admin approves them, and never touch a draw that is already selling."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Products' }]}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        {editing && (
          <ProductForm
            kind={editing.kind}
            product={editing.product}
            onCancel={() => setEditing(null)}
            onSaved={(text) => {
              setEditing(null);
              setNotice(text);
              load();
            }}
          />
        )}

        {scheduling && (
          <ScheduleForm
            product={scheduling}
            existing={templates.filter((t) => t.productId === scheduling.productId && t.status === 'ACTIVE')}
            onCancel={() => setScheduling(null)}
            onSaved={() => {
              setScheduling(null);
              setNotice('Schedule sent for approval.');
              load();
            }}
          />
        )}

        {(
          [
            ['Daily products', 'DAILY_STANDARD', daily],
            ['Jackpot products', 'SATURDAY_JACKPOT', jackpot],
          ] as [string, Kind, AdminProduct[]][]
        ).map(([title, kind, list]) => (
          <SectionCard
            key={kind}
            title={title}
            description={kind === 'DAILY_STANDARD' ? 'Prize pool with up to 4 categories. Cash prizes only.' : 'Up to 3 stages; management sets how many winners each picks. The app picks who.'}
            rightSlot={
              <button type="button" onClick={() => setEditing({ product: null, kind })} className={smallButton}>
                <Plus className="h-3.5 w-3.5" /> New {kind === 'DAILY_STANDARD' ? 'daily' : 'jackpot'} product
              </button>
            }
          >
            {loading && list.length === 0 ? (
              <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
            ) : list.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No products yet.</p>
            ) : (
              <div className="space-y-3">
                {list.map((p) => (
                  <ProductCard
                    key={p.productId}
                    product={p}
                    templates={templates.filter((t) => t.productId === p.productId)}
                    onEdit={() => setEditing({ product: p, kind })}
                    onSchedule={() => setScheduling(p)}
                    onApprove={() => run(() => api.admin.approveProduct(p.productId), `${p.name}: approved.`)}
                    onReject={(note) => run(() => api.admin.rejectProduct(p.productId, note), `${p.name}: change rejected.`)}
                    onToggle={() => run(() => api.admin.setProductActive(p.productId, !p.active), `${p.name} switched ${p.active ? 'off' : 'on'}.`)}
                    onApproveTemplate={(id) => run(() => api.admin.approveDrawTemplate(id), 'Schedule approved.')}
                    onRejectTemplate={(id, note) => run(() => api.admin.rejectDrawTemplate(id, note), 'Schedule rejected.')}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        ))}
      </div>
    </>
  );
}

function ProductCard({
  product: p,
  templates,
  onEdit,
  onSchedule,
  onApprove,
  onReject,
  onToggle,
  onApproveTemplate,
  onRejectTemplate,
}: {
  product: AdminProduct;
  templates: AdminDrawTemplate[];
  onEdit: () => void;
  onSchedule: () => void;
  onApprove: () => void;
  onReject: (note: string) => void;
  onToggle: () => void;
  onApproveTemplate: (id: string) => void;
  onRejectTemplate: (id: string, note: string) => void;
}) {
  const [note, setNote] = useState('');
  const active = templates.filter((t) => t.status === 'ACTIVE');
  const pendingTemplates = templates.filter((t) => t.status === 'PENDING_APPROVAL');

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-[#0B1220]">
            {p.name} <span className="font-mono text-xs font-bold text-slate-400">{p.code}</span>
          </p>
          <p className="text-sm text-slate-600">
            {formatNaira(p.ticketPriceNgn)} ticket · printed as “{p.ticketLabel}” · {p.prizeDescription}
          </p>
          <p className="mt-1 text-xs text-slate-500">{termsSummary(p)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {p.active ? 'On' : p.approved ? 'Off' : 'Awaiting approval'}
          </span>
          {p.approved && (
            <>
              <button type="button" onClick={onEdit} disabled={!!p.pending} className={smallButton}>
                <Pencil className="h-3.5 w-3.5" /> Change
              </button>
              <button type="button" onClick={onSchedule} className={smallButton}>
                <Clock className="h-3.5 w-3.5" /> Add or change a draw time
              </button>
              <button type="button" onClick={onToggle} className={smallButton}>
                <Power className="h-3.5 w-3.5" /> {p.active ? 'Switch off' : 'Switch on'}
              </button>
            </>
          )}
        </div>
      </div>

      {p.pending && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-bold text-amber-800">
            {p.pending.isNewProduct ? 'New product awaiting approval' : 'Change awaiting approval'}
            {p.pending.proposedAt ? ` · proposed ${new Date(p.pending.proposedAt).toLocaleString('en-NG')}` : ''}
          </p>
          {p.pending.change && <p className="mt-1 text-amber-800">Proposed: {formatNaira(p.pending.change.ticketPriceNgn)} ticket · {termsSummary({ ...p, ...p.pending.change })}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onApprove} className={approveButton}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, to reject" className="h-8 flex-1 rounded-md border border-amber-200 bg-white px-2 text-xs" />
            <button type="button" disabled={note.trim().length < 4} onClick={() => onReject(note.trim())} className={rejectButton}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-700">Only a senior admin who did not propose it can approve.</p>
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Draw times</p>
        {active.length === 0 && pendingTemplates.length === 0 ? (
          <p className="text-sm text-slate-500">No draw times yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {active.map((t) => (
              <li key={t.templateId}>
                <span className="font-bold">{t.slotCode}</span> · {windowText(t)}
              </li>
            ))}
            {pendingTemplates.map((t) => (
              <TemplatePending key={t.templateId} template={t} onApprove={onApproveTemplate} onReject={onRejectTemplate} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TemplatePending({
  template: t,
  onApprove,
  onReject,
}: {
  template: AdminDrawTemplate;
  onApprove: (id: string) => void;
  onReject: (id: string, note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <li className="rounded-md border border-amber-200 bg-amber-50 p-2">
      <span className="font-bold">{t.slotCode}</span> · {windowText(t)} <span className="text-xs font-bold text-amber-700">awaiting approval</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onApprove(t.templateId)} className={approveButton}>Approve</button>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, to reject" className="h-8 flex-1 rounded-md border border-amber-200 bg-white px-2 text-xs" />
        <button type="button" disabled={note.trim().length < 4} onClick={() => onReject(t.templateId, note.trim())} className={rejectButton}>Reject</button>
      </div>
    </li>
  );
}

function ProductForm({
  kind,
  product,
  onCancel,
  onSaved,
}: {
  kind: Kind;
  product: AdminProduct | null;
  onCancel: () => void;
  onSaved: (notice: string) => void;
}) {
  const model = kind === 'DAILY_STANDARD' ? 'POOL' : 'STAGES';
  const [code, setCode] = useState(product?.code ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [ticketLabel, setTicketLabel] = useState(product?.ticketLabel ?? '');
  const [price, setPrice] = useState(String(product?.ticketPriceNgn ?? (kind === 'DAILY_STANDARD' ? 100 : 500)));
  const [headline, setHeadline] = useState(product?.prizeDescription ?? '');
  const [prize, setPrize] = useState<PrizeSetupForm>(() =>
    product
      ? prizeSetupFromDraw({
          prizeModel: model,
          poolPayoutBp: product.poolPayoutBp ?? null,
          poolMinimumNgn: product.poolMinimumNgn ?? null,
          poolRevenueBasis: product.poolRevenueBasis ?? null,
          tiers: product.tiers,
        })
      : defaultPrizeSetup(model),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNgn = /^\d{1,9}$/.test(price.trim()) ? Number(price.trim()) : NaN;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { payload, errors } = prizeSetupPayload(prize);
    const problems = [...errors];
    if (!Number.isInteger(priceNgn) || priceNgn < 1) problems.push('Enter a ticket price in whole naira.');
    if (problems.length > 0) {
      setError(problems.join(' '));
      return;
    }
    const terms: AdminProductTerms = {
      name: name.trim(),
      ticketLabel: ticketLabel.trim(),
      ticketPriceNgn: priceNgn,
      prizeDescription: headline.trim(),
      poolPayoutBp: payload.poolPayoutBp ?? null,
      poolMinimumNgn: payload.poolMinimumNgn ?? null,
      poolRevenueBasis: payload.poolRevenueBasis ?? null,
      tiers: payload.tiers ?? [],
    };
    setSaving(true);
    setError(null);
    try {
      if (product) {
        await api.admin.proposeProductChange(product.productId, terms);
        onSaved(`${terms.name}: change sent for approval. Until it is approved, the current terms stay in force.`);
      } else {
        await api.admin.createProduct({ ...terms, code: code.trim().toUpperCase(), kind });
        onSaved(`${terms.name}: created and sent for approval. Nothing is scheduled until it is approved and given draw times.`);
      }
    } catch (err) {
      setError(message(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title={product ? `Change ${product.name}` : `New ${kind === 'DAILY_STANDARD' ? 'daily' : 'jackpot'} product`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!product && (
            <Field label="Code" hint="2–12 capital letters or digits, used in draw codes">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} className={input} />
            </Field>
          )}
          <Field label="Product name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} />
          </Field>
          <Field label="Name printed on the ticket">
            <input value={ticketLabel} onChange={(e) => setTicketLabel(e.target.value)} maxLength={40} className={input} />
          </Field>
          <Field label="Ticket price (₦)" hint={Number.isInteger(priceNgn) ? formatNaira(priceNgn) : undefined}>
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Headline shown to buyers" hint="e.g. Win up to ₦250,000">
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} className={input} />
            </Field>
          </div>
        </div>

        <PrizeSetupEditor value={prize} onChange={setPrize} ticketPriceNgn={Number.isInteger(priceNgn) ? priceNgn : 100} fixedModel />

        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? 'Sending…' : 'Send for approval'}
          </button>
          <button type="button" onClick={onCancel} className={smallButton}>Cancel</button>
        </div>
      </form>
    </SectionCard>
  );
}

function ScheduleForm({
  product,
  existing,
  onCancel,
  onSaved,
}: {
  product: AdminProduct;
  existing: AdminDrawTemplate[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isDaily = product.kind === 'DAILY_STANDARD';
  const [slotCode, setSlotCode] = useState(isDaily ? 'NOON' : 'WEEKEND');
  const preset = useMemo(() => existing.find((t) => t.slotCode === slotCode), [existing, slotCode]);
  const [opens, setOpens] = useState(isDaily ? '19:00' : '13:00');
  const [previousDay, setPreviousDay] = useState(isDaily);
  const [cutoff, setCutoff] = useState(isDaily ? '11:00' : '19:00');
  const [drawTime, setDrawTime] = useState(isDaily ? '12:00' : '20:00');
  const [weekdays, setWeekdays] = useState<number[]>(isDaily ? [0, 1, 2, 3, 4, 5, 6] : [6]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!preset) return;
    if (preset.salesOpenMinutesWat != null) setOpens(hhmm(preset.salesOpenMinutesWat));
    setPreviousDay(preset.salesOpenPreviousDay);
    setCutoff(hhmm(preset.cutoffMinutesWat));
    setDrawTime(hhmm(preset.scheduledMinutesWat));
    setWeekdays(preset.weekdays);
  }, [preset]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const o = minutes(opens);
    const c = minutes(cutoff);
    const d = minutes(drawTime);
    if (o == null || c == null || d == null) {
      setError('Enter every time as HH:MM, e.g. 19:00.');
      return;
    }
    if (weekdays.length === 0) {
      setError('Pick at least one day.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.admin.proposeDrawTemplate({
        productId: product.productId,
        slotCode: slotCode.trim().toUpperCase(),
        label: `${product.name} ${slotCode.trim().toUpperCase()}`,
        salesOpenMinutesWat: o,
        salesOpenPreviousDay: previousDay,
        cutoffMinutesWat: c,
        scheduledMinutesWat: d,
        weekdays,
      });
      onSaved();
    } catch (err) {
      setError(message(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title={`Draw time for ${product.name}`} description="Times are Nigerian time (WAT). Sales close automatically at the cutoff; the hour before the draw is for checks.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Slot" hint={preset ? 'replaces the current one' : 'new'}>
            <input value={slotCode} onChange={(e) => setSlotCode(e.target.value.toUpperCase())} maxLength={20} className={input} />
          </Field>
          <Field label="Sales open">
            <input value={opens} onChange={(e) => setOpens(e.target.value)} className={input} />
          </Field>
          <Field label="Sales close">
            <input value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={input} />
          </Field>
          <Field label="Draw time">
            <input value={drawTime} onChange={(e) => setDrawTime(e.target.value)} className={input} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={previousDay} onChange={(e) => setPreviousDay(e.target.checked)} className="h-4 w-4" />
          Sales open the evening before the draw (e.g. 7pm for a noon draw)
        </label>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((day, i) => (
            <label key={day} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${weekdays.includes(i) ? 'border-navy-700 bg-navy-50 font-bold' : 'border-slate-200'}`}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={weekdays.includes(i)}
                onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, i].sort() : weekdays.filter((x) => x !== i))}
              />
              {day}
            </label>
          ))}
        </div>
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Sending…' : 'Send for approval'}</button>
          <button type="button" onClick={onCancel} className={smallButton}>Cancel</button>
        </div>
      </form>
    </SectionCard>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-[#0B1220]">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function termsSummary(p: Pick<AdminProduct, 'prizeModel' | 'poolPayoutBp' | 'poolMinimumNgn' | 'tiers'>): string {
  const on = p.tiers.filter((t) => t.active);
  if (p.prizeModel === 'POOL') {
    return `Pool ${pct(p.poolPayoutBp ?? null)} of sales, at least ${formatNaira(p.poolMinimumNgn ?? 0)} · ${on
      .map((t) => `${t.name} ${pct(t.allocationBp ?? null)} at ${formatNaira(t.prizePerWinnerNgn)}`)
      .join(', ')}`;
  }
  return on
    .map((t) => `${t.name}: ${t.winnerCount} × ${t.itemPrize ? `${t.prizeDescription} or ${formatNaira(t.prizePerWinnerNgn)}` : formatNaira(t.prizePerWinnerNgn)}`)
    .join(' · ');
}

function windowText(t: AdminDrawTemplate): string {
  const days = t.weekdays.length === 7 ? 'every day' : t.weekdays.map((d) => DAY_LABELS[d]).join(', ');
  const opens = t.salesOpenMinutesWat == null ? 'on creation' : `${hhmm(t.salesOpenMinutesWat)}${t.salesOpenPreviousDay ? ' the day before' : ''}`;
  return `sales ${opens} to ${hhmm(t.cutoffMinutesWat)}, draw ${hhmm(t.scheduledMinutesWat)}, ${days}`;
}

function pct(bp: number | null): string {
  if (bp == null) return '—';
  return bp % 100 === 0 ? `${bp / 100}%` : `${(bp / 100).toFixed(2)}%`;
}

function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function minutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

function message(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

const input = 'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';
const smallButton = 'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#0B1220] hover:border-slate-300 disabled:opacity-40';
const primaryButton = 'rounded-md bg-navy-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50';
const approveButton = 'inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-black text-white';
const rejectButton = 'inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-700 disabled:opacity-40';

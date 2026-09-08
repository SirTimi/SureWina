'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Phone, Plus, PowerOff, Users } from 'lucide-react';
import type { AdminCollectionPoint } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { canPerformAction, type AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const STATES = ['ANA', 'LAG', 'FCT', 'RIV', 'KAN', 'OYO', 'ENU', 'DEL', 'EDO', 'ABI'];

export default function CollectionPointsPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [points, setPoints] = useState<AdminCollectionPoint[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [stateCode, setStateCode] = useState('LAG');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [openingHours, setOpeningHours] = useState('');

  const load = () => {
    setLoading(true);
    api.admin
      .listCollectionPoints(showClosed)
      .then((res) => setPoints(res.points))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load collection points.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [showClosed]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setContactPhone('');
    setOpeningHours('');
    setFormOpen(false);
    setError(null);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) return setError('Give the point a name staff will recognise.');
    if (address.trim().length < 5) return setError('Enter the full street address.');

    setBusy(true);
    try {
      await api.admin.createCollectionPoint({
        name: name.trim(),
        stateCode,
        address: address.trim(),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        ...(openingHours.trim() ? { openingHours: openingHours.trim() } : {}),
      });
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this collection point.');
    } finally {
      setBusy(false);
    }
  };

  const close = async (point: AdminCollectionPoint) => {
    if (
      !window.confirm(
        `Close ${point.name}?\n\nWinners will no longer be able to book collection here. Existing records are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.admin.closeCollectionPoint(point.pointId);
      load();
    } catch (err) {
      // The API refuses to close a point that still has staff assigned, and
      // says how many — surfacing that verbatim is more useful than a
      // generic failure.
      setError(err instanceof Error ? err.message : 'Could not close this point.');
    } finally {
      setBusy(false);
    }
  };

  const canCreate = canPerformAction(session, 'CREATE_COLLECTION_POINT');
  const active = points.filter((p) => p.isActive);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Collection points"
        description="Where winners collect product prizes. Staff are assigned to a point when their account is created."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Collection points' }]}
        rightSlot={
          <GuardedActionButton
            session={session}
            action="CREATE_COLLECTION_POINT"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setFormOpen(true)}
            disabled={formOpen}
            className="rounded-md bg-navy-800 text-white"
          >
            New point
          </GuardedActionButton>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {/* Without at least one point, no support staff can be created and no
            prize can be released anywhere except through an agent. Worth
            saying plainly rather than showing an empty table. */}
        {!loading && active.length === 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-black text-[#0B1220]">No open collection points.</p>
              <p className="mt-1 text-sm text-amber-900">
                Counter staff cannot be created until at least one exists, and winners have
                nowhere to collect a product prize.
                {canCreate ? ' Add one to get started.' : ''}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {formOpen && (
          <SectionCard title="New collection point">
            <form onSubmit={create} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field label="Name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ikeja City Mall counter"
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="State">
                  <select
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className={inputCls}
                  >
                    {STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Address">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Shop 24, Obafemi Awolowo Way, Ikeja"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Contact number (optional)">
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+2348012345678"
                    className={`${inputCls} font-mono`}
                  />
                </Field>
                <Field label="Opening hours (optional)">
                  <input
                    value={openingHours}
                    onChange={(e) => setOpeningHours(e.target.value)}
                    placeholder="Mon–Sat, 9am–6pm"
                    className={inputCls}
                  />
                </Field>
              </div>

              <p className="text-xs leading-relaxed text-slate-500">
                The contact number and hours are shown to winners deciding where to collect,
                so they are worth filling in even though they are optional.
              </p>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
                >
                  {busy ? 'Creating…' : 'Create point'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </SectionCard>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading
              ? 'Loading…'
              : `${active.length} open${
                  showClosed ? `, ${points.length - active.length} closed` : ''
                }`}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="h-4 w-4"
            />
            Show closed points
          </label>
        </div>

        {loading ? (
          <div className="h-48 animate-pulse rounded-xl bg-white" />
        ) : points.length === 0 ? null : (
          <div className="space-y-3">
            {points.map((p) => (
              <div
                key={p.pointId}
                className={
                  p.isActive
                    ? 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
                    : 'rounded-xl border border-slate-200 bg-slate-50 p-5 opacity-70'
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-lg font-black text-[#0B1220]">{p.name}</p>
                      <StatusPill tone={p.isActive ? 'success' : 'neutral'}>
                        {p.isActive ? 'Open' : 'Closed'}
                      </StatusPill>
                      <StatusPill tone="info">{p.stateCode}</StatusPill>
                    </div>

                    <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      {p.address}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                      {p.contactPhone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <span className="font-mono">{p.contactPhone}</span>
                        </span>
                      )}
                      {p.openingHours && <span>{p.openingHours}</span>}
                      {/* A point nobody works cannot release a prize, so this
                          belongs next to the point rather than buried in the
                          user admin screen. */}
                      <span
                        className={
                          p.isActive && p.staffCount === 0
                            ? 'flex items-center gap-1.5 font-bold text-amber-700'
                            : 'flex items-center gap-1.5'
                        }
                      >
                        <Users className="h-4 w-4 text-slate-400" />
                        {p.staffCount === 0
                          ? 'No staff assigned'
                          : `${p.staffCount} staff`}
                      </span>
                    </div>
                  </div>

                  {p.isActive && (
                    <GuardedActionButton
                      session={session}
                      action="CLOSE_COLLECTION_POINT"
                      icon={<PowerOff className="h-4 w-4" />}
                      onClick={() => close(p)}
                      disabled={busy}
                      className="rounded-md border-red-200 bg-red-50 text-red-700"
                    >
                      Close
                    </GuardedActionButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const inputCls =
  'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">{label}</label>
      {children}
    </div>
  );
}
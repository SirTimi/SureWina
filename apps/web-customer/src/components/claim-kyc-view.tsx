'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Camera,
  Check,
  ChevronLeft,
  CreditCard,
  FileText,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
import type { ClaimKycStatus } from '@surewina/types';
import { api } from '@/lib/api';

type SubStep = 'docs' | 'bvn' | 'bank';

interface ClaimKycViewProps {
  claimId: string;
  initialStep: SubStep;
}

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
  { code: '999992', name: 'OPay' },
  { code: '999991', name: 'PalmPay' },
  { code: '50211', name: 'Kuda' },
];

const ID_TYPES = [
  { value: 'NIN', label: 'National Identity Number (NIN)' },
  { value: 'DRIVER_LICENCE', label: 'Driver licence' },
  { value: 'INTERNATIONAL_PASSPORT', label: 'International passport' },
  { value: 'VOTER_CARD', label: 'Voter card' },
] as const;

export function ClaimKycView({ claimId, initialStep }: ClaimKycViewProps) {
  const router = useRouter();
  const [kyc, setKyc] = useState<ClaimKycStatus | null>(null);
  const [step, setStep] = useState<SubStep>(initialStep);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.claims
      .getClaimKycStatus(claimId)
      .then((r) => setKyc(r.kyc))
      .catch((err) => setError(err.message ?? 'Could not load KYC status.'));
  }, [claimId]);

  const goToNextStep = (currentKyc: ClaimKycStatus) => {
    setKyc(currentKyc);

    if (currentKyc.status === 'COMPLETE') {
      router.push(`/claim/${claimId}/cash`);
      return;
    }

    if (step === 'docs' && currentKyc.documentUploaded) {
      setStep('bvn');
      router.replace(`/claim/${claimId}/cash/kyc?step=bvn`, { scroll: false });
    } else if (step === 'bvn' && currentKyc.bvnLast4) {
      setStep('bank');
      router.replace(`/claim/${claimId}/cash/kyc?step=bank`, { scroll: false });
    } else if (step === 'bank' && currentKyc.bankAccount) {
      router.push(`/claim/${claimId}/cash`);
    }
  };

  if (error && !kyc) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="sm" className="py-20 text-center">
          <Card
            variant="default"
            className="rounded-2xl border-red-100 bg-white p-8 shadow-sm"
          >
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />

            <h1 className="mt-4 font-display text-2xl font-black text-navy-950">
              KYC unavailable
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">{error}</p>

            <Link href={`/claim/${claimId}/cash`} className="mt-6 inline-block">
              <Button
                variant="accent"
                className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
              >
                Back to overview
              </Button>
            </Link>
          </Card>
        </Container>
      </main>
    );
  }

  if (!kyc) {
    return (
      <main className="min-h-screen bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
          <div className="h-[520px] animate-pulse rounded-3xl bg-white" />
        </Container>
      </main>
    );
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(kyc.kycDeadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1240px] pb-12 pt-28">
        <Link
          href={`/claim/${claimId}/cash`}
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to cash overview
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0">
            <Card
              variant="default"
              className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-white p-6 sm:p-7">
                <div className="mb-6">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
                    Cash claim verification
                  </p>

                  <h1 className="mt-2 font-display text-3xl font-black leading-tight tracking-[-0.03em] text-navy-950 sm:text-4xl">
                    {step === 'docs' && 'Upload your ID and selfie.'}
                    {step === 'bvn' && 'Verify your BVN.'}
                    {step === 'bank' && 'Link your bank account.'}
                  </h1>

                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
                    {step === 'docs' &&
                      'We need a clear ID image and a selfie so the payout cannot be claimed by the wrong person.'}
                    {step === 'bvn' &&
                      'Your BVN helps confirm the identity behind the cash payout. We do not store it in plaintext.'}
                    {step === 'bank' &&
                      'Add the Nigerian bank account where the verified cash prize should be paid.'}
                  </p>
                </div>

                <KycProgress kyc={kyc} step={step} />
              </div>

              <div className="p-6 sm:p-7">
                {step === 'docs' && (
                  <DocsForm claimId={claimId} onSuccess={goToNextStep} />
                )}

                {step === 'bvn' && (
                  <BvnForm claimId={claimId} onSuccess={goToNextStep} />
                )}

                {step === 'bank' && (
                  <BankForm claimId={claimId} onSuccess={goToNextStep} />
                )}
              </div>
            </Card>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Verification status
              </p>

              <div className="mt-5 space-y-3">
                <StatusItem
                  done={kyc.documentUploaded && kyc.selfieUploaded}
                  active={step === 'docs'}
                  title="ID and selfie"
                  body="Confirm the person claiming matches the winning ticket."
                />

                <StatusItem
                  done={!!kyc.bvnLast4}
                  active={step === 'bvn'}
                  title="BVN"
                  body="Confirm identity before payout."
                />

                <StatusItem
                  done={!!kyc.bankAccount}
                  active={step === 'bank'}
                  title="Bank account"
                  body="Confirm where the cash should be paid."
                />
              </div>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                <Lock className="h-5 w-5" />
              </div>

              <p className="font-display text-xl font-black text-navy-950">
                Your details are protected.
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                KYC details are used for prize verification and payout compliance. They
                should not be used for marketing or public winner records.
              </p>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Deadline
              </p>

              <p className="mt-2 font-display text-3xl font-black text-navy-950">
                {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
              </p>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Complete verification by{' '}
                <span className="font-bold text-navy-950">
                  {new Date(kyc.kycDeadlineAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                .
              </p>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function KycProgress({ kyc, step }: { kyc: ClaimKycStatus; step: SubStep }) {
  const items = [
    {
      label: 'ID + selfie',
      done: kyc.documentUploaded && kyc.selfieUploaded,
      current: step === 'docs',
    },
    {
      label: 'BVN',
      done: !!kyc.bvnLast4,
      current: step === 'bvn',
    },
    {
      label: 'Bank',
      done: !!kyc.bankAccount,
      current: step === 'bank',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={
            item.done
              ? 'rounded-2xl border border-navy-200 bg-amber-50 p-4'
              : item.current
                ? 'rounded-2xl border border-navy-200 bg-[#F8FAF4] p-4'
                : 'rounded-2xl border border-slate-200 bg-white p-4'
          }
        >
          <div className="flex items-center gap-3">
            <div
              className={
                item.done
                  ? 'flex h-8 w-8 items-center justify-center rounded-sm bg-navy-800 text-white'
                  : item.current
                    ? 'flex h-8 w-8 items-center justify-center rounded-sm bg-navy-50 font-mono text-xs font-black text-navy-700'
                    : 'flex h-8 w-8 items-center justify-center rounded-sm bg-slate-100 font-mono text-xs font-black text-slate-400'
              }
            >
              {item.done ? <Check className="h-4 w-4" /> : index + 1}
            </div>

            <div>
              <p
                className={
                  item.done || item.current
                    ? 'text-sm font-black text-navy-950'
                    : 'text-sm font-black text-slate-400'
                }
              >
                {item.label}
              </p>
              <p
                className={
                  item.done
                    ? 'text-xs font-medium text-navy-700'
                    : item.current
                      ? 'text-xs font-medium text-slate-500'
                      : 'text-xs font-medium text-slate-400'
                }
              >
                {item.done ? 'Done' : item.current ? 'Current' : 'Locked'}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// === DOCS STEP ===

function DocsForm({
  claimId,
  onSuccess,
}: {
  claimId: string;
  onSuccess: (k: ClaimKycStatus) => void;
}) {
  const [docType, setDocType] = useState<(typeof ID_TYPES)[number]['value']>('NIN');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!docFile) {
      setError('Upload a photo of your ID.');
      return;
    }

    if (!selfieFile) {
      setError('Take a selfie so we can confirm it matches your ID.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const docBase64 = await fileToBase64(docFile);
      const selfieBase64 = await fileToBase64(selfieFile);

      const res = await api.claims.submitKycDocument({
        claimId,
        documentType: docType,
        documentImageBase64: docBase64,
        selfieImageBase64: selfieBase64,
      });

      onSuccess(res.kyc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <label htmlFor="docType" className="mb-2 block text-sm font-bold text-navy-950">
            ID type
          </label>

          <select
            id="docType"
            value={docType}
            onChange={(e) => setDocType(e.target.value as (typeof ID_TYPES)[number]['value'])}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
          >
            {ID_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Use the same legal identity you will use for payout.
          </p>
        </div>

        <div className="rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4">
          <p className="text-sm font-black text-navy-950">Before you upload</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
            <li>• Use a clear image with all corners visible.</li>
            <li>• Do not crop out your name or ID number.</li>
            <li>• Upload JPG or PNG, maximum 5 MB.</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FileSlot
          label="Photo of your ID"
          hint="Clear front image · all corners visible"
          file={docFile}
          onSelect={setDocFile}
          icon={Upload}
          inputRef={docInputRef}
        />

        <FileSlot
          label="Selfie holding your ID"
          hint="Hold the ID near your face"
          file={selfieFile}
          onSelect={setSelfieFile}
          icon={Camera}
          inputRef={selfieInputRef}
          accept="image/*"
          capture="user"
        />
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm leading-relaxed text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          onClick={handleSubmit}
          isLoading={submitting}
          disabled={submitting}
          variant="accent"
          size="lg"
          className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          Continue to BVN
          <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="text-xs leading-relaxed text-slate-500">
          Review usually takes under 1 hour.
        </p>
      </div>
    </div>
  );
}

interface FileSlotProps {
  label: string;
  hint: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  icon: typeof Upload;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  capture?: 'user' | 'environment';
}

function FileSlot({
  label,
  hint,
  file,
  onSelect,
  icon: Icon,
  inputRef,
  accept = 'image/*',
  capture,
}: FileSlotProps) {
  return (
    <div>
      <p className="mb-2 block text-sm font-bold text-navy-950">{label}</p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={
          file
            ? 'group flex min-h-32 w-full items-center gap-4 rounded-2xl border border-navy-200 bg-amber-50 p-5 text-left transition hover:bg-amber-50'
            : 'group flex min-h-32 w-full items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-left transition hover:border-navy-700 hover:bg-[#F8FAF4]'
        }
      >
        <div
          className={
            file
              ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-navy-800 text-white'
              : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-500 group-hover:bg-navy-50 group-hover:text-navy-700'
          }
        >
          {file ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-navy-950">
            {file ? file.name : 'Tap to upload'}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {file ? `${(file.size / 1024).toFixed(0)} KB · tap to change` : hint}
          </p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

// === BVN STEP ===

function BvnForm({
  claimId,
  onSuccess,
}: {
  claimId: string;
  onSuccess: (k: ClaimKycStatus) => void;
}) {
  const [bvn, setBvn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!/^\d{11}$/.test(bvn)) {
      setError('BVN must be exactly 11 digits.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await api.claims.submitKycBvn({ claimId, bvn });
      onSuccess(res.kyc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BVN check failed. Try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <label htmlFor="bvn" className="mb-2 block text-sm font-bold text-navy-950">
        BVN number
      </label>

      <input
        id="bvn"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        value={bvn}
        onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
        placeholder="22123456789"
        className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 font-mono text-xl tracking-wider text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
      />

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{bvn.length} / 11 digits</span>
        <span>Dial *565*0# to retrieve it</span>
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm leading-relaxed text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-xs leading-relaxed text-slate-600">
          <span className="font-bold text-navy-950">Why we need this:</span> BVN helps
          verify that the payout account belongs to the same person claiming the prize.
          Only verification details should be stored, not the full BVN in plaintext.
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        isLoading={submitting}
        disabled={submitting || bvn.length !== 11}
        variant="accent"
        size="lg"
        className="mt-6 rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
      >
        Verify BVN
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// === BANK STEP ===

function BankForm({
  claimId,
  onSuccess,
}: {
  claimId: string;
  onSuccess: (k: ClaimKycStatus) => void;
}) {
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!bankCode) {
      setError('Pick your bank.');
      return;
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      setError('Account number must be exactly 10 digits.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await api.claims.submitKycBank({ claimId, bankCode, accountNumber });
      onSuccess(res.kyc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bank verification failed. Try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div>
        <label htmlFor="bankCode" className="mb-2 block text-sm font-bold text-navy-950">
          Bank
        </label>

        <select
          id="bankCode"
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
        >
          <option value="">Select your bank…</option>
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5">
        <label
          htmlFor="accountNumber"
          className="mb-2 block text-sm font-bold text-navy-950"
        >
          Account number
        </label>

        <input
          id="accountNumber"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
          placeholder="0123456789"
          className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 font-mono text-xl tracking-wider text-navy-950 outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
        />

        <p className="mt-2 text-xs text-slate-500">{accountNumber.length} / 10 digits</p>
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm leading-relaxed text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-xs leading-relaxed text-slate-600">
          The bank account should belong to the verified winner. We may reject mismatched
          account details.
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        isLoading={submitting}
        disabled={submitting || !bankCode || accountNumber.length !== 10}
        variant="accent"
        size="lg"
        className="mt-6 rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
      >
        Confirm bank and complete KYC
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function StatusItem({
  done,
  active,
  title,
  body,
}: {
  done: boolean;
  active: boolean;
  title: string;
  body: string;
}) {
  return (
    <div
      className={
        done
          ? 'rounded-2xl border border-navy-100 bg-amber-50 p-4'
          : active
            ? 'rounded-2xl border border-navy-200 bg-[#F8FAF4] p-4'
            : 'rounded-2xl border border-slate-100 bg-white p-4'
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            done
              ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-navy-800 text-white'
              : active
                ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700'
                : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-400'
          }
        >
          {done ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </div>

        <div>
          <p className="text-sm font-black text-navy-950">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
        </div>
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}
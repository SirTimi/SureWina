'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  CreditCard,
  FileText,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button, Container } from '@surewina/ui';
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
  { code: '999991', name: 'OPay' },
  { code: '999992', name: 'PalmPay' },
  { code: '999993', name: 'Kuda' },
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

  // Auto-advance on success
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
      // Final — back to overview
      router.push(`/claim/${claimId}/cash`);
    }
  };

  if (error && !kyc) {
    return (
      <Container size="sm" className="py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-navy-950">KYC unavailable</h1>
        <p className="mt-2 text-slate-500">{error}</p>
        <Link href={`/claim/${claimId}/cash`} className="mt-6 inline-block">
          <Button variant="primary">Back to overview</Button>
        </Link>
      </Container>
    );
  }

  if (!kyc) {
    return (
      <Container size="sm" className="py-16">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </Container>
    );
  }

  return (
    <Container size="sm" className="max-w-[640px] py-8 sm:py-10">
      <Link
        href={`/claim/${claimId}/cash`}
        className="mb-5 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#4E8F01]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to overview
      </Link>

      {/* Mini progress */}
      <div className="mb-8 flex items-center gap-2">
        <ProgressDot
          label="ID + selfie"
          state={kyc.documentUploaded ? 'done' : step === 'docs' ? 'current' : 'future'}
          stepNum={1}
        />
        <ProgressLine done={kyc.documentUploaded} />
        <ProgressDot
          label="BVN"
          state={kyc.bvnLast4 ? 'done' : step === 'bvn' ? 'current' : 'future'}
          stepNum={2}
        />
        <ProgressLine done={!!kyc.bvnLast4} />
        <ProgressDot
          label="Bank"
          state={kyc.bankAccount ? 'done' : step === 'bank' ? 'current' : 'future'}
          stepNum={3}
        />
      </div>

      {step === 'docs' && (
        <DocsForm claimId={claimId} onSuccess={goToNextStep} kyc={kyc} />
      )}
      {step === 'bvn' && (
        <BvnForm claimId={claimId} onSuccess={goToNextStep} kyc={kyc} />
      )}
      {step === 'bank' && (
        <BankForm claimId={claimId} onSuccess={goToNextStep} kyc={kyc} />
      )}
    </Container>
  );
}

function ProgressDot({
  label,
  state,
  stepNum,
}: {
  label: string;
  state: 'done' | 'current' | 'future';
  stepNum: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
          state === 'done'
            ? 'border-[#4E8F01] bg-[#4E8F01] text-white'
            : state === 'current'
            ? 'border-[#4E8F01] bg-[#A8E368]/20 text-[#4E8F01]'
            : 'border-slate-200 bg-white text-slate-400'
        }`}
      >
        {state === 'done' ? <Check className="h-4 w-4" /> : stepNum}
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          state === 'future' ? 'text-slate-400' : 'text-slate-700'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function ProgressLine({ done }: { done: boolean }) {
  return (
    <div
      className={`mt-[-12px] h-0.5 flex-1 ${done ? 'bg-[#4E8F01]' : 'bg-slate-200'}`}
    />
  );
}

// === DOCS STEP ===

function DocsForm({
  claimId,
  onSuccess,
  kyc,
}: {
  claimId: string;
  onSuccess: (k: ClaimKycStatus) => void;
  kyc: ClaimKycStatus;
}) {
  const [docType, setDocType] = useState<typeof ID_TYPES[number]['value']>('NIN');
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
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
        <FileText className="h-3.5 w-3.5" />
        Step 1 · ID and selfie
      </div>
      <h1 className="font-display text-3xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-4xl">
        Upload your ID and a selfie.
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Both images stay encrypted at rest. We auto-delete them 90 days after your prize is paid.
      </p>

      <div className="mt-8 space-y-5">
        {/* ID type picker */}
        <div>
          <label
            htmlFor="docType"
            className="mb-2 block text-sm font-bold text-navy-950"
          >
            Which ID are you uploading?
          </label>
          <select
            id="docType"
            value={docType}
            onChange={(e) => setDocType(e.target.value as typeof ID_TYPES[number]['value'])}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/40"
          >
            {ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* ID upload */}
        <FileSlot
          label="Photo of your ID (front)"
          hint="JPG or PNG · clear, all corners visible · max 5 MB"
          file={docFile}
          onSelect={(f) => setDocFile(f)}
          icon={Upload}
          inputRef={docInputRef}
        />

        {/* Selfie */}
        <FileSlot
          label="Selfie holding your ID"
          hint="Hold the ID next to your face · plain background works best"
          file={selfieFile}
          onSelect={(f) => setSelfieFile(f)}
          icon={Camera}
          inputRef={selfieInputRef}
          accept="image/*"
          capture="user"
        />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-sm text-rose-900">{error}</p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          isLoading={submitting}
          disabled={submitting}
          variant="accent"
          size="lg"
          fullWidth
          className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
        >
          Continue to BVN
          <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="text-center text-xs text-slate-500">
          Your ID is reviewed within 1 hour. We&apos;ll SMS you when it&apos;s cleared.
        </p>
      </div>
    </div>
  );
}

interface FileSlotProps {
  label: string;
  hint: string;
  file: File | null;
  onSelect: (f: File | null) => void;
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
  icon,
  inputRef,
  accept = 'image/*',
  capture,
}: FileSlotProps) {
  const Icon = icon;
  return (
    <div>
      <p className="mb-2 block text-sm font-bold text-navy-950">{label}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed bg-white p-5 text-left transition hover:border-[#4E8F01] hover:bg-[#A8E368]/5 ${
          file ? 'border-[#4E8F01] bg-[#A8E368]/10' : 'border-slate-300'
        }`}
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            file ? 'bg-[#4E8F01] text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-[#A8E368]/30 group-hover:text-[#4E8F01]'
          }`}
        >
          {file ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy-950">
            {file ? file.name : 'Tap to upload'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
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
  kyc,
}: {
  claimId: string;
  onSuccess: (k: ClaimKycStatus) => void;
  kyc: ClaimKycStatus;
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
      setError(err instanceof Error ? err.message : 'BVN check failed.');
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
        <ShieldCheck className="h-3.5 w-3.5" />
        Step 2 · BVN
      </div>
      <h1 className="font-display text-3xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-4xl">
        Enter your Bank Verification Number.
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Dial *565*0# from the phone tied to your bank account to retrieve your BVN if you
        don&apos;t remember it. We only verify — we never store it in plaintext.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <label htmlFor="bvn" className="mb-2 block text-sm font-bold text-navy-950">
            BVN (11 digits)
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
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-lg tracking-wider text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/40"
          />
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {bvn.length} / 11 digits
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-sm text-rose-900">{error}</p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          isLoading={submitting}
          disabled={submitting || bvn.length !== 11}
          variant="accent"
          size="lg"
          fullWidth
          className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
        >
          Verify BVN
          <ArrowRight className="h-4 w-4" />
        </Button>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-xs text-slate-600">
            <span className="font-bold text-navy-950">Why we need this:</span> the Central Bank
            mandates BVN verification for all financial payouts above ₦10,000. We check the BVN
            matches the name on your ID — that&apos;s it.
          </p>
        </div>
      </div>
    </div>
  );
}

// === BANK STEP ===

function BankForm({
  claimId,
  onSuccess,
  kyc,
}: {
  claimId: string;
  onSuccess: (k: ClaimKycStatus) => void;
  kyc: ClaimKycStatus;
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
      setError(err instanceof Error ? err.message : 'Bank verification failed.');
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
        <CreditCard className="h-3.5 w-3.5" />
        Step 3 · Bank account
      </div>
      <h1 className="font-display text-3xl font-black leading-tight tracking-[-0.02em] text-navy-950 sm:text-4xl">
        Where should we send the money?
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        We resolve the account name automatically and only confirm if it matches the name on your
        ID. Make sure it&apos;s the same person.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <label htmlFor="bankCode" className="mb-2 block text-sm font-bold text-navy-950">
            Bank
          </label>
          <select
            id="bankCode"
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/40"
          >
            <option value="">Select your bank…</option>
            {NIGERIAN_BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="accountNumber"
            className="mb-2 block text-sm font-bold text-navy-950"
          >
            Account number (10 digits)
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
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-lg tabular-nums tracking-wider text-navy-950 outline-none transition focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/40"
          />
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {accountNumber.length} / 10 digits
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-sm text-rose-900">{error}</p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          isLoading={submitting}
          disabled={submitting || !bankCode || accountNumber.length !== 10}
          variant="accent"
          size="lg"
          fullWidth
          className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
        >
          Confirm bank and complete KYC
          <ArrowRight className="h-4 w-4" />
        </Button>
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
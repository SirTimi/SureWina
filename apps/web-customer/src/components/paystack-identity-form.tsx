'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3 } from 'lucide-react';
import { Button } from '@surewina/ui';
import type { ClaimKycStatus } from '@surewina/types';
import { api } from '@/lib/api';
import { useNigerianBanks } from '@/hooks/use-nigerian-banks';

type Props = {
  claimId: string;
  identityStatus: ClaimKycStatus['identityStatus'];
  onSuccess: (kyc: ClaimKycStatus) => void;
};

const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25';

export function PaystackIdentityForm({ claimId, identityStatus, onSuccess }: Props) {
  const { banks, loading: banksLoading, error: banksError } = useNigerianBanks();
  const [bvn, setBvn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An uncertain provider outcome must not lead to an automatic retry.
  const awaitingResult =
    identityStatus === 'PREPARING' ||
    identityStatus === 'SUBMITTED' ||
    identityStatus === 'UNKNOWN';

  if (identityStatus === 'VERIFIED') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-bold text-emerald-900">Identity and bank account verified</p>
          <p className="mt-2 text-sm leading-relaxed text-emerald-800">
            Paystack has confirmed the verification result. A compliance officer must still
            review your claim before any payout can be approved.
          </p>
        </div>
      </div>
    );
  }

  if (awaitingResult) {
    return (
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-amber-700" />
          <p className="font-bold text-amber-900">
            {identityStatus === 'UNKNOWN' ? 'Verification needs review' : 'Verification in progress'}
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-amber-800">
          {identityStatus === 'UNKNOWN'
            ? 'We could not confirm the provider outcome. Please do not resubmit while it is being investigated.'
            : 'Your details have been submitted. This page will check for an updated status. No payout will be approved while the result is pending.'}
        </p>
      </div>
    );
  }

  const valid =
    /^\d{11}$/.test(bvn) &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    !!bankCode &&
    banks.some((bank) => bank.code === bankCode) &&
    /^\d{10}$/.test(accountNumber) &&
    consent;

  const submit = async () => {
    if (!valid || submitting || banksLoading || !!banksError) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.claims.startKycIdentity({
        claimId,
        bvn,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        bankCode,
        accountNumber,
      });

      // Never retain full BVN or bank account details after submission.
      setBvn('');
      setAccountNumber('');
      onSuccess(result.kyc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start identity verification.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm leading-relaxed text-slate-600">
        Use the legal name connected to your BVN. The nominated bank account must
        belong to the same person.
      </p>

      {identityStatus === 'FAILED' && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Your previous verification failed. Check your details before submitting another request.
        </div>
      )}

      <div>
        <label htmlFor="kyc-first-name" className="text-sm font-bold text-navy-950">Legal first name</label>
        <input id="kyc-first-name" className={inputClass} value={firstName}
          autoComplete="given-name" maxLength={100}
          onChange={(e) => setFirstName(e.target.value)} disabled={submitting} />
      </div>
      <div>
        <label htmlFor="kyc-last-name" className="text-sm font-bold text-navy-950">Legal last name</label>
        <input id="kyc-last-name" className={inputClass} value={lastName}
          autoComplete="family-name" maxLength={100}
          onChange={(e) => setLastName(e.target.value)} disabled={submitting} />
      </div>
      <div>
        <label htmlFor="kyc-email" className="text-sm font-bold text-navy-950">Email address</label>
        <input id="kyc-email" className={inputClass} value={email} type="email"
          autoComplete="email" maxLength={254}
          onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
      </div>
      <div>
        <label htmlFor="kyc-bvn" className="text-sm font-bold text-navy-950">BVN</label>
        <input id="kyc-bvn" className={inputClass} value={bvn} type="text"
          inputMode="numeric" autoComplete="off" maxLength={11}
          onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
          disabled={submitting} />
        <p className="mt-1 text-xs text-slate-500">{bvn.length} / 11 digits</p>
      </div>
      <div>
        <label htmlFor="kyc-bank" className="text-sm font-bold text-navy-950">Bank</label>
        <select id="kyc-bank" className={inputClass} value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          disabled={banksLoading || !!banksError || submitting}>
          <option value="">
            {banksLoading ? 'Loading banks...' : banksError ? 'Bank directory unavailable' : 'Select your bank'}
          </option>
          {banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
        </select>
        {banksError && <p role="alert" className="mt-2 text-sm text-red-700">{banksError}</p>}
      </div>
      <div>
        <label htmlFor="kyc-account" className="text-sm font-bold text-navy-950">Bank account number</label>
        <input id="kyc-account" className={inputClass} value={accountNumber}
          inputMode="numeric" autoComplete="off" maxLength={10}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
          disabled={submitting} />
        <p className="mt-1 text-xs text-slate-500">{accountNumber.length} / 10 digits</p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <input type="checkbox" checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={submitting} className="mt-1" />
        <span className="text-xs leading-relaxed text-slate-600">
          I authorize SureWina to submit my BVN and nominated bank details to Paystack
          for identity and account ownership verification, subject to the privacy notice.
        </span>
      </label>

      {error && (
        <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-700" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Button type="button" variant="accent" size="lg" onClick={submit}
        isLoading={submitting} disabled={!valid || submitting || banksLoading || !!banksError}>
        {submitting ? 'Submitting...' : 'Submit for verification'}
      </Button>
    </div>
  );
}

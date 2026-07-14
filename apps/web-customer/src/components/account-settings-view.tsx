'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, Phone, User, CreditCard, Bell, LogOut, AlertCircle } from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatPhoneForDisplay } from '@surewina/utils';
import type { UserMe } from '@surewina/types';
import { api } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import { ProfileForm } from '@/components/profile-form';
import { BankAccountForm } from '@/components/bank-account-form';
import { NotificationToggles } from '@/components/notification-toggles';

export function AccountSettingsView() {
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .getMe()
      .then(setUser)
      .catch((err) => setError(err.message ?? 'Could not load your account.'));
  }, []);

  const handleSignOut = async () => {
    try {
      await api.auth.signOut();
    } catch {
      // ignore — we're clearing local state regardless
    }
    clearAuth();
    router.push('/');
  };

  if (error) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-danger font-medium">{error}</p>
      </Card>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-ink-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Phone (read-only) */}
      <Card variant="default" className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <Phone className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-base text-ink-950">Phone number</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              Your phone is your account ID. To change it, contact support.
            </p>
          </div>
        </div>
        <div className="bg-ink-50 border border-ink-100 rounded-md px-4 py-3 inline-flex items-center gap-3">
          <span className="font-mono text-base text-ink-950">
            {formatPhoneForDisplay(user.phoneNumber)}
          </span>
          <Badge variant="verified" withDot>
            Verified
          </Badge>
        </div>
      </Card>

      {/* Profile (display name + email) */}
      <Card variant="default" className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <User className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-base text-ink-950">Profile</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              Optional. Used for personalised messages and your WHT certificate if you win cash.
            </p>
          </div>
        </div>
        <ProfileForm user={user} onUpdate={setUser} />
      </Card>

      {/* KYC status */}
      <Card variant="default" className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <Shield className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-base text-ink-950">Verification</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              Your identity verification status with Surewina.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <KycRow
            label="Phone (OTP)"
            description="Required for all account access"
            verified={user.kycStatus === 'OTP_VERIFIED' || user.kycStatus === 'TIER1_COMPLETE'}
          />
          <KycRow
            label="Tier 1 KYC"
            description="Required only for cash prize conversion (over ₦10,000)"
            verified={user.kycStatus === 'TIER1_COMPLETE'}
          />
        </div>

        {user.kycStatus !== 'TIER1_COMPLETE' && (
          <p className="text-xs text-ink-500 mt-5 leading-relaxed">
            We don&apos;t collect KYC documents until you actually win a cash prize. If you win
            a product, no extra verification is needed beyond your phone number.
          </p>
        )}
      </Card>

      {/* Bank account */}
      <Card variant="default" className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <CreditCard className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-base text-ink-950">Bank account</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              For cash prize payouts. We pay directly to your verified Nigerian bank account.
            </p>
          </div>
        </div>
        <BankAccountForm user={user} onUpdate={setUser} />
      </Card>

      {/* Notification preferences */}
      <Card variant="default" className="p-6">
        <div className="flex items-start gap-3 mb-5">
          <Bell className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-base text-ink-950">Notifications</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              Choose how we contact you. SMS for ticket purchases is mandatory and can&apos;t be
              turned off.
            </p>
          </div>
        </div>
        <NotificationToggles user={user} onUpdate={setUser} />
      </Card>

      {/* Responsible play link */}
      <Card variant="default" className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-navy-800 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display font-semibold text-base text-ink-950">
                Spending limits and self-exclusion
              </h2>
              <p className="text-sm text-ink-500 mt-0.5">
                Cap how much you spend, or take a break.
              </p>
            </div>
          </div>
          <Link href="/dashboard/responsible-play">
            <Button variant="secondary" size="md">
              Manage
            </Button>
          </Link>
        </div>
      </Card>

      {/* Sign out */}
      <Card variant="default" className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <LogOut className="w-4 h-4 text-ink-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display font-semibold text-base text-ink-950">Sign out</h2>
              <p className="text-sm text-ink-500 mt-0.5">
                You can sign back in any time with your phone number.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="md" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

function KycRow({
  label,
  description,
  verified,
}: {
  label: string;
  description: string;
  verified: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-ink-950">{label}</p>
        <p className="text-xs text-ink-500 mt-0.5">{description}</p>
      </div>
      {verified ? (
        <Badge variant="verified" withDot>
          Complete
        </Badge>
      ) : (
        <Badge variant="muted">Not required yet</Badge>
      )}
    </div>
  );
}
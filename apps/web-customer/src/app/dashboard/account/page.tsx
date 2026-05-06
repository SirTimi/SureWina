import { Container } from '@surewina/ui';
import { AccountSettingsView } from '@/components/account-settings-view';

export default function AccountPage() {
  return (
    <Container size="md" className="py-10">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink-950">Account settings</h1>
        <p className="text-base text-ink-500 mt-2">
          Manage your profile, KYC, bank account, and how we contact you.
        </p>
      </div>

      <AccountSettingsView />
    </Container>
  );
}
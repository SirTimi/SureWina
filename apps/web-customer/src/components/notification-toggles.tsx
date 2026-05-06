'use client';

import { useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import type { UserMe } from '@surewina/types';
import { api } from '@/lib/api';

type Channel = 'sms' | 'push' | 'email';

const channels: { id: Channel; label: string; description: string; required?: boolean }[] = [
  {
    id: 'sms',
    label: 'SMS',
    description: 'Ticket confirmations and win notifications. Required for ticket purchases.',
    required: true,
  },
  {
    id: 'push',
    label: 'Push notifications',
    description: 'Draw countdowns, jackpot alerts, claim updates.',
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Monthly summaries and tax certificates. Requires email on profile.',
  },
];

export function NotificationToggles({
  user,
  onUpdate,
}: {
  user: UserMe;
  onUpdate: (u: UserMe) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [savedChannel, setSavedChannel] = useState<Channel | null>(null);

  const toggle = async (channel: Channel) => {
    if (channel === 'sms') return; // mandatory
    if (channel === 'email' && !user.email) {
      setError('Add an email to your profile before enabling email notifications.');
      return;
    }

    setError(null);
    const next = !user.notificationPreferences[channel];

    try {
      const updated = await api.account.updateNotificationPreferences({ [channel]: next });
      onUpdate(updated);
      setSavedChannel(channel);
      setTimeout(() => setSavedChannel(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update preferences.');
    }
  };

  return (
    <div className="space-y-1">
      {channels.map((c) => {
        const value = user.notificationPreferences[c.id];
        const disabled = c.required;
        return (
          <div
            key={c.id}
            className="flex items-start justify-between gap-4 py-3 border-b border-ink-100 last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink-950">{c.label}</p>
                {savedChannel === c.id && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-success">
                    <Check className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-500 mt-0.5">{c.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={value}
              disabled={disabled}
              onClick={() => toggle(c.id)}
              className={
                value
                  ? 'relative inline-flex w-11 h-6 rounded-full bg-navy-800 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'relative inline-flex w-11 h-6 rounded-full bg-ink-200 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed'
              }
            >
              <span
                className={
                  value
                    ? 'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform translate-x-5'
                    : 'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform'
                }
              />
            </button>
          </div>
        );
      })}

      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-md p-3 flex items-start gap-2 mt-3">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}
    </div>
  );
}
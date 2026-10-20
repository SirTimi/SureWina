
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type {
  NigerianBankOption,
} from '@surewina/api-client';

export function useNigerianBanks() {
  const [banks, setBanks] = useState<NigerianBankOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    api.account
      .listNigerianBanks()
      .then((response) => {
        if (!active) return;
        setBanks(response.banks);
      })
      .catch(() => {
        if (!active) return;
        setError('Could not load Nigerian banks. Please retry.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { banks, loading, error };
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, QrCode, Search } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { QrScanner } from '@/components/qr-scanner';

export default function PayPrizeLookupPage() {
  return (
    <AgentShell>
      {() => <LookupBody />}
    </AgentShell>
  );
}

function LookupBody() {
  const router = useRouter();
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = ref.trim().toUpperCase();
    if (!/^SW-[A-Z0-9]{2,5}-[A-Z0-9]{2,5}$/.test(cleaned)) {
      setError('Reference must look like SW-XXXX-XXXX.');
      return;
    }
    router.push(`/pay-prize/${cleaned}`);
  };

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Pay prize"
        title="Look up a winning ticket"
        description="Scan the QR code on the ticket, or enter the reference by hand. We will verify if it is a winner before payment."
        backHref="/"
      />

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        {/* Scanning is the fast path — typing a 12-character reference at a
            counter with a customer waiting is where mistakes happen. The
            field below stays for damaged tickets and phones without a
            working camera. */}
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-base font-black text-white"
        >
          <QrCode className="h-5 w-5" />
          Scan ticket
        </button>

        <p className="my-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          or enter the reference
        </p>

        <form onSubmit={submit}>
          <label htmlFor="ref" className="mb-2 block text-sm font-bold text-navy-950">
            Ticket reference
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="ref"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="SW-XXXX-XXXX"
              className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-center font-mono text-xl font-black tracking-[0.18em] text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="accent"
            size="lg"
            fullWidth
            className="mt-5 rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
          >
            Look up ticket
            <ArrowRight className="h-5 w-5" />
          </Button>
        </form>
      </Card>

      {scanning && (
        <QrScanner
          onResult={(ticketRef) => {
            setScanning(false);
            router.push(`/pay-prize/${ticketRef}`);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </main>
  );
}
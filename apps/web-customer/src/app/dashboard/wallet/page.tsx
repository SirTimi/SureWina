import { Container } from '@surewina/ui';
import { CustomerWalletView } from '@/components/customer-wallet-view';

interface WalletPageProps {
  searchParams: Promise<{
    fundingReference?: string;
    transactionId?: string;
    fundingError?: string;
  }>;
}

export default async function WalletPage({
  searchParams,
}: WalletPageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1200px] py-10">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
            Wallet
          </p>

          <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
            My wallet
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Top up securely with Monnify or Flutterwave, see your available balance,
            and review every wallet movement from one place.
          </p>
        </div>

        <CustomerWalletView
          fundingReference={params.fundingReference ?? null}
          providerTransactionId={params.transactionId ?? null}
          callbackError={params.fundingError ?? null}
        />
      </Container>
    </main>
  );
}

import Link from 'next/link';
import { Container } from '@surewina/ui';
import { JackpotOfferCheckout } from '@/components/jackpot-offer-checkout';

interface PageProps {
  params: Promise<{ offerId: string }>;
}

export default async function JackpotOfferCheckoutPage({ params }: PageProps) {
  const { offerId } = await params;

  return (
    <main className="min-h-screen bg-[#F8FAF4] pb-20 pt-28">
      <Container size="md">
        <Link href="/" className="mb-5 inline-flex text-sm font-semibold text-navy-700 hover:underline">
          Back to draws
        </Link>
        <JackpotOfferCheckout offerId={offerId} />
      </Container>
    </main>
  );
}

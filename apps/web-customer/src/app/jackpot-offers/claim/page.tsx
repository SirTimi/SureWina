import Link from 'next/link';
import { Container } from '@surewina/ui';
import { VerifiedJackpotOffers } from '@/components/verified-jackpot-offers';

export default function JackpotOfferClaimPage() {
  return (
    <main className="min-h-screen bg-[#F8FAF4] pb-20 pt-28">
      <Container size="md">
        <Link href="/" className="text-sm font-semibold text-navy-700 hover:underline">
          Back to SureWina
        </Link>
        <VerifiedJackpotOffers />
      </Container>
    </main>
  );
}

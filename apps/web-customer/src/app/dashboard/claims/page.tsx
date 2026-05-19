import { Container } from '@surewina/ui';
import { ClaimsListView } from '@/components/claims-list-view';

export default function ClaimsPage() {
  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1200px] py-10">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
            Claims
          </p>

          <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
            My claims
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Every prize you&apos;ve won, claim status, fulfilment path, and next action
            in one place.
          </p>
        </div>

        <ClaimsListView />
      </Container>
    </main>
  );
}
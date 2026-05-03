import { Container } from '@surewina/ui';

export default function DrawDetailLoading() {
  return (
    <Container size="lg" className="py-8">
      <div className="h-4 w-32 bg-ink-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-6">
          <div className="bg-white border border-ink-100 rounded-lg overflow-hidden">
            <div className="aspect-[16/9] bg-ink-100 animate-pulse" />
            <div className="p-6 space-y-4">
              <div className="h-8 bg-ink-100 rounded animate-pulse w-2/3" />
              <div className="h-4 bg-ink-100 rounded animate-pulse" />
              <div className="h-4 bg-ink-100 rounded animate-pulse w-5/6" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-ink-100 rounded-lg p-6 h-96 animate-pulse" />
      </div>
    </Container>
  );
}
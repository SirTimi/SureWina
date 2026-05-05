import { Phone } from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import { SpendLimitForm } from '@/components/spend-limit-form';
import { TakeABreakForm } from '@/components/take-a-break-form';

export default function ResponsiblePlayPage() {
  return (
    <Container size="md" className="py-12">
      <div className="mb-8">
        <Badge variant="success" className="mb-5">
          For your protection
        </Badge>
        <h1 className="font-display text-4xl font-bold text-ink-950">Responsible play</h1>
        <p className="text-base text-ink-500 mt-3 max-w-xl leading-relaxed">
          A raffle should be entertainment, not a financial plan. Set limits and we&apos;ll enforce
          them, even on us.
        </p>
      </div>

      <div className="space-y-6">
        <SpendLimitForm />
        <TakeABreakForm />

        {/* Helpline */}
        <Card variant="default" className="p-6 bg-ink-50/50">
          <div className="flex items-start gap-4">
            <Phone className="w-5 h-5 text-navy-800 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-display font-semibold text-base text-ink-950 mb-1">
                Need to talk to someone?
              </h3>
              <p className="text-sm text-ink-700 leading-relaxed">
                The Federal Ministry of Health runs a free, confidential helpline for problem
                gambling:{' '}
                <span className="font-mono font-semibold text-ink-950">0800 GAMBLE</span>{' '}
                (0800 426253). 24/7, free from any Nigerian network.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
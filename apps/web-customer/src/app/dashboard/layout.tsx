import { Container } from '@surewina/ui';
import { AuthRequired } from '@/components/auth-required';
import { DashboardNav } from '@/components/dashboard-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthRequired>
      <div className="border-b border-ink-100 bg-white">
        <Container size="lg">
          <DashboardNav />
        </Container>
      </div>
      {children}
    </AuthRequired>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Container, Card } from '@surewina/ui';
import { isSignedIn } from '@/lib/auth';

interface AuthRequiredProps {
  children: React.ReactNode;
}

/**
 * Client-side guard. If not signed in, redirects to /sign-in?next=<current path>.
 * Backend version uses middleware + httpOnly cookies — this is the mock layer.
 */
export function AuthRequired({ children }: AuthRequiredProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isSignedIn()) {
      setChecked(true);
    } else {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [router, pathname]);

  if (!checked) {
    return (
      <Container size="md" className="py-16">
        <Card variant="default" className="p-10 text-center">
          <p className="text-ink-500 text-sm">Loading your dashboard…</p>
        </Card>
      </Container>
    );
  }

  return <>{children}</>;
}
'use client';

// Right after sign-in: finds this student's application for the published cycle (or starts one) and sends her to
// the step she is on. If the cycle is not open she goes to the landing, which then shows the closed page.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@btx/ui';
import { stepPath } from '@/lib/steps';
import { ensureApplication, getAuthMode, getBrowserClient } from '@btx/data';

export function ApplyStart({ next }: { next?: string }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);

  // Runs once on arrival.
  useEffect(() => {
    let live = true;
    (async () => {
      // mock mode has no database: go straight to step 1
      if (getAuthMode() === 'mock') {
        router.replace(next ?? '/apply/basic-info');
        return;
      }
      const r = await ensureApplication(getBrowserClient());
      if (!live) return;
      if (r.kind === 'closed') router.replace('/');
      else if (r.kind === 'error') setProblem(r.message);
      else if (r.application.status === 'submitted') router.replace('/status');
      else router.replace(next ?? stepPath(r.application.current_step));
    })();
    return () => {
      live = false;
    };
  }, [router, next]);

  return (
    <div className="app">
      <TopBar variant="signed-in" />
      <main id="main" className="pm">
        <h1 className="st" style={{ fontSize: 32, lineHeight: 1.08 }}>
          {problem ? "We couldn't open your application." : 'Opening your application.'}
        </h1>
        {problem ? (
          <p className="ld">
            Something went wrong on our side. <Link href="/apply/start" className="lk">Try again</Link>, or email us if it keeps happening.
          </p>
        ) : null}
      </main>
    </div>
  );
}

'use client';

// Right after sign-in: finds this student's application for the published cycle (or starts one) and sends her to
// the step she is on. If the cycle is not open she goes to the landing, which then shows the closed page.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@btx/ui';
import { stepPath } from '@/lib/steps';
import { TerpmailRefusal } from './terpmail-refusal';
import { ensureApplication, getAuthMode, getBrowserClient, getSignedInEmail } from '@btx/data';
import { refusalIsTerpmail } from '@/lib/terpmail';
import { track } from '@/lib/analytics-client';

export function ApplyStart({ next, demo }: { next?: string; demo?: string }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [terpmail, setTerpmail] = useState(false);

  // Runs once on arrival.
  useEffect(() => {
    let live = true;
    (async () => {
      // mock mode has no database: go straight to step 1
      if (getAuthMode() === 'mock') {
        if (demo === 'terpmail') {
          setTerpmail(true);
          return;
        }
        // the mock keeps no applications, so every arrival starts one
        track('application_begin');
        router.replace(next ?? '/apply/basic-info');
        return;
      }
      const r = await ensureApplication(getBrowserClient());
      if (!live) return;
      if (r.kind === 'closed') router.replace('/');
      else if (r.kind === 'refused') {
        // a refused insert is the Terpmail rule only when her address fails it; otherwise the cycle closed under her
        if (refusalIsTerpmail(await getSignedInEmail())) {
          track('sign_in_error', { code: 'terpmail_refused' });
          setTerpmail(true);
        } else router.replace('/');
      }
      else if (r.kind === 'error') setProblem(r.message);
      else if (r.application.status === 'submitted') router.replace('/status');
      else {
        // count "application started" only when this visit created the draft (no id is sent)
        if (r.created) track('application_begin');
        router.replace(next ?? stepPath(r.application.current_step));
      }
    })();
    return () => {
      live = false;
    };
  }, [router, next, demo]);

  return (
    <div className="app">
      <TopBar variant="signed-in" />
      <main id="main" className="pm" data-review="Opening your application">
        <h1 className="st" style={{ fontSize: 32, lineHeight: 1.08 }}>
          {problem || terpmail ? "We couldn't open your application." : 'Opening your application.'}
        </h1>
        {terpmail ? <TerpmailRefusal /> : null}
        {problem ? (
          <p className="ld">
            Something went wrong on our side. <Link href="/apply/start" className="lk">Try again</Link>, or email us if it keeps happening.
          </p>
        ) : null}
      </main>
    </div>
  );
}

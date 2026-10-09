'use client';

// The load-error screens (drafts landing-error*.html, apply-error*.html, status-error*.html): the page frame with the
// shared LoadError block. Try again asks the server to load the page again.
import { useRouter } from 'next/navigation';
import { LoadError, TopBar } from '@btx/ui';
import { getAuthMode } from '@btx/data';

// The landing's load error (signed-out header).
export function LandingLoadError() {
  const router = useRouter();
  return (
    <div className="app">
      <TopBar variant="signed-out" />
      <main id="main" className="pm">
        <LoadError onRetry={() => router.refresh()} />
      </main>
    </div>
  );
}

// The load error inside the application and on the status page (signed-in header).
export function ApplyLoadError({ status }: { status?: boolean }) {
  const router = useRouter();
  void status;
  // review mode (no database) shows the drafts' sample name
  const name = getAuthMode() === 'mock' ? 'Ebony Coleman' : undefined;
  return (
    <div className="app">
      <TopBar variant="signed-in" accountName={name} />
      <main id="main" className="pm">
        <LoadError onRetry={() => router.refresh()} />
      </main>
    </div>
  );
}

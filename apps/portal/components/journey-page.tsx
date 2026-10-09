// The frame for the booking pages (schedule, change your time, none of these times work): the signed-in top bar, the
// page, and on phone the pinned action bar (the laptop draws its actions inline, so the bar is hidden there).
import type { ReactNode } from 'react';
import { BottomBar, TopBar } from '@btx/ui';
import b from './booking.module.css';

export function JourneyPage({ accountName, children, back, primary }: { accountName: string; children: ReactNode; back?: ReactNode; primary?: ReactNode }) {
  return (
    <div className="app">
      <TopBar variant="signed-in" accountName={accountName} />
      <main id="main" className={b.page}>
        {children}
      </main>
      {primary ? <BottomBar className={b.phoneBar} back={back} primary={primary} /> : null}
    </div>
  );
}

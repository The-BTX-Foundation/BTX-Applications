// Goals while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(goals)/goals/loading.tsx on every real navigation to /goals, by `?demo=loading` in mock mode (with the sample's
// year and news card, as the demo draws them), and in place of the error card while "Try again" reloads.
import '@/components/refresh/refresh.css';
import './goals.css';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { Sk } from '@/components/refresh/skeleton';

// The page header: the title with the year picker beside it, the news card under it. `loading` adds the grey title lines.
export function GoalsHead({ picker, news, loading = false }: { picker?: ReactNode; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head gl-head">
      <div>
        {loading ? (
          <div className="gl-sk-hl" aria-hidden="true">
            <Sk />
            <Sk />
          </div>
        ) : null}
        <div className="rf-ptitle">
          <h1>Goals</h1>
          {picker}
        </div>
        {news}
      </div>
    </header>
  );
}

// The goals card's grey blocks: a heading line and four goal rows (icon, two lines, the drawing, the number).
export function GoalsSkelCard() {
  return (
    <div className="gl-skel" aria-hidden="true">
      <div className="rf-sk-ph">
        <Sk />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="gl-sk-goal">
          <Sk className="gl-sk-tile" />
          <span className="gl-lines">
            <Sk />
            <Sk />
          </span>
          <Sk className="gl-sk-bar" />
          <Sk />
        </div>
      ))}
    </div>
  );
}

/** What the mock `?demo=loading` state draws in the header (the real loading file has no data, so it draws the title alone). */
export type SkeletonHead = { year: number; showPicker: boolean; news: { kicker: string; title: string } | null };

// The whole page while it loads.
export function GoalsSkeleton({ head }: { head?: SkeletonHead }) {
  return (
    <div className="rf gl" data-state="loading" aria-busy="true">
      <p className="rf-sr" role="status">
        Loading goals
      </p>
      <GoalsHead
        loading
        picker={
          head?.showPicker ? (
            // Drawn as the picker looks; it works once the page has loaded.
            <span className="gl-ypick" aria-hidden="true">
              <span>{head.year}</span>
              <Icon name="down" />
            </span>
          ) : null
        }
        news={
          head?.news ? (
            <div className="rf-nx" aria-hidden="true">
              <span className="rf-nx-i">
                <Icon name="money" />
              </span>
              <span className="rf-nx-m">
                <span className="rf-nx-k">{head.news.kicker}</span>
                <span className="rf-nx-t">{head.news.title}</span>
              </span>
              <span className="rf-nx-go">
                See it
                <Icon name="chev" />
              </span>
            </div>
          ) : null
        }
      />
      <GoalsSkelCard />
    </div>
  );
}

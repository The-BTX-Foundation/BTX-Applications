// Fundraising while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(fundraising)/finance/fundraising/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and in
// place of the error card while "Try again" reloads. Also holds the phone's Finance tabs, which every state draws.
import '@/components/refresh/refresh.css';
import './fundraising.css';
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// The phone's Finance tabs under the header (the laptop sidebar carries the same links). `budgetCount` null = no count.
export function FinanceTabs({ budgetCount }: { budgetCount: number | null }) {
  return (
    <nav className="fr-secnav" aria-label="Finance">
      <Link href="/finance/budget">
        Budget
        {budgetCount ? (
          <span className="fr-count">
            <span aria-hidden="true">{budgetCount}</span>
            <span className="rf-sr">, {budgetCount} for you</span>
          </span>
        ) : null}
      </Link>
      <Link href="/finance/fundraising" aria-current="page">
        Fundraising
      </Link>
      <Link href="/finance/grants">Grants</Link>
    </nav>
  );
}

// The header while loading: grey title and news-card blocks, and the search box as the loaded page draws it.
function SkelHead() {
  return (
    <header className="rf-head">
      <div>
        <div className="fr-sk-hl" aria-hidden="true">
          <Sk />
          <Sk />
        </div>
      </div>
      <div className="rf-search" aria-hidden="true">
        <Icon name="search" />
        <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
      </div>
    </header>
  );
}

// One grey panel: a heading line and `rows` short lines, each with a bar under it when `bars`.
export function SkelPanel({ rows, bars = true }: { rows: number; bars?: boolean }) {
  return (
    <section className="rf-panel" aria-hidden="true">
      <div className="rf-pcard">
        <div className="fr-sk-box">
          <Sk className="fr-sk-t" />
          {Array.from({ length: rows }, (_, i) => (
            <Fragment key={i}>
              <Sk className="fr-sk-s" />
              {bars ? <Sk className="fr-sk-bar" /> : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

// The board's grey panels, in the board's two columns.
export function SkelBoard() {
  return (
    <div className="fr-board" aria-hidden="true">
      <div className="fr-col">
        <SkelPanel rows={5} />
        <SkelPanel rows={2} bars={false} />
      </div>
      <div className="fr-col">
        <SkelPanel rows={5} bars={false} />
      </div>
    </div>
  );
}

// The whole page while it loads. `budgetCount` is the phone tab's count when known (mock mode's sample).
export function FundraisingSkeleton({ budgetCount = null }: { budgetCount?: number | null }) {
  return (
    <div className="rf fr" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Fundraising</h1>
      <p className="rf-sr" role="status">
        Loading fundraising
      </p>
      <SkelHead />
      <FinanceTabs budgetCount={budgetCount} />
      <SkelBoard />
    </div>
  );
}

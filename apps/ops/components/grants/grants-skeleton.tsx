// Grants while it loads, plus the page parts the skeleton shares with the real page: the header (title, date, news card,
// the laptop search look) and the phone's Finance tabs. Drawn by app/(shell)/(grants)/finance/grants/loading.tsx on every
// real navigation to /finance/grants, by `?demo=loading` in mock mode, and in place of the error card while "Try again" reloads.
import '@/components/refresh/refresh.css';
import './grants.css';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// The page header: the title with the date (or, while loading, grey blocks shaped like the title and the news card), the
// news card under it, and the search box's look on laptops.
export function GrantsHead({ date, news, loading = false }: { date?: string; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head gr-head">
      <div>
        {loading ? (
          <div className="gr-sk-hl" aria-hidden="true">
            <Sk />
            <Sk />
          </div>
        ) : (
          <>
            <div className="rf-ptitle">
              <h1 id="gr-h1" tabIndex={-1}>
                Grants
              </h1>
              {date ? <span className="rf-pdate">{date}</span> : null}
            </div>
            {news}
          </>
        )}
      </div>
      <div className="rf-search" aria-hidden="true">
        <Icon name="search" />
        <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
      </div>
    </header>
  );
}

// The phone's Finance tabs under the title (the sidebar is hidden there): Budget, Fundraising, Grants (this page).
export function FinanceTabs({ budgetCount }: { budgetCount?: number | null }) {
  return (
    <nav className="gr-secnav" aria-label="Finance">
      <Link href="/finance/budget">
        Budget
        {budgetCount ? (
          <span className="gr-count">
            {budgetCount}
            <span className="rf-sr"> for you</span>
          </span>
        ) : null}
      </Link>
      <Link href="/finance/fundraising">Fundraising</Link>
      <Link href="/finance/grants" aria-current="page">
        Grants
      </Link>
    </nav>
  );
}

// One grey panel: a title line, then `rows` lines (each with a slim bar under it when `bars`).
function SkPanel({ rows, bars }: { rows: number; bars: boolean }) {
  return (
    <section className="rf-panel" aria-hidden="true">
      <div className="rf-pcard">
        <div className="gr-sk-box">
          <Sk className="gr-sk-t" />
          {Array.from({ length: rows }, (_, i) => (
            <Fragment key={i}>
              <Sk className="gr-sk-s" />
              {bars ? <Sk className="gr-sk-bar" /> : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

// The board's grey panels: the pipeline (three lines with bars) beside the checklist (four lines).
export function GrantsSkelBoard() {
  return (
    <div className="gr-board" aria-hidden="true">
      <div className="gr-col">
        <SkPanel rows={3} bars />
      </div>
      <div className="gr-col">
        <SkPanel rows={4} bars={false} />
      </div>
    </div>
  );
}

// The whole page while it loads.
export function GrantsSkeleton({ budgetCount }: { budgetCount?: number | null }) {
  return (
    <div className="rf gr" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Grants</h1>
      <p className="rf-sr" role="status">
        Loading grants
      </p>
      <GrantsHead loading />
      <FinanceTabs budgetCount={budgetCount} />
      <GrantsSkelBoard />
    </div>
  );
}

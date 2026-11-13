// Budget while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by the routes'
// loading.tsx files on every real navigation, by `?demo=loading` in mock mode, and while "Try again" reloads. The approval
// route draws the same board of grey panels (as the demo does), without the phone's Finance tabs.
import '@/components/refresh/refresh.css';
import './budget.css';
import { Fragment } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';
import { FinanceTabs } from './budget-parts';

// One grey panel: a title line, then `rows` lines (each with a slim bar under it when `bars`).
function SkPanel({ rows, bars = true }: { rows: number; bars?: boolean }) {
  return (
    <section className="rf-panel" aria-hidden="true">
      <div className="rf-pcard">
        <div className="bu-sk-box">
          <Sk className="bu-sk-t" />
          {Array.from({ length: rows }, (_, i) => (
            <Fragment key={i}>
              <Sk className="bu-sk-s" />
              {bars ? <Sk className="bu-sk-bar" /> : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

// The board of grey panels: the plan across the top, then two columns.
export function BudgetSkelBoard() {
  return (
    <div className="rf-board bu-board" aria-hidden="true">
      <div className="bu-span">
        <SkPanel rows={2} />
      </div>
      <div className="rf-col">
        <SkPanel rows={5} />
        <SkPanel rows={1} bars={false} />
      </div>
      <div className="rf-col">
        <SkPanel rows={1} />
        <SkPanel rows={1} bars={false} />
      </div>
    </div>
  );
}

// The whole page while it loads: the grey title and news card, (on the board route) the Finance tabs, then the grey board.
export function BudgetSkeleton({ approval = false }: { approval?: boolean }) {
  return (
    <div className={`rf bu${approval ? ' bu-ap' : ''}`} data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Budget</h1>
      <p className="rf-sr" role="status">
        Loading budget
      </p>
      <header className="rf-head">
        <div className="bu-sk-hl" aria-hidden="true">
          <Sk />
          <Sk />
        </div>
        <div className="rf-search" aria-hidden="true">
          <Icon name="search" />
          <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
        </div>
      </header>
      {approval ? null : <FinanceTabs count={0} />}
      <BudgetSkelBoard />
    </div>
  );
}

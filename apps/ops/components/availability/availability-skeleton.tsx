// Interviews > Your availability while it loads: grey blocks shaped like the page (the demo's loading state), no spinner.
// Drawn by app/(shell)/(availability)/scholarships/interviews/availability/loading.tsx on every real navigation, by
// `?demo=loading` in mock mode, and while "Try again" reloads. Also holds the header the page and the skeleton share.
import '@/components/refresh/refresh.css';
import './availability.css';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';

// The page header: "Your availability" with the term beside it and the news card under it; `loading` draws grey blocks.
// The search box is drawn as in the current app (search is not built yet, so it is not a field; phones hide it).
export function FyHead({ term, news, loading = false }: { term?: string; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head fy-head">
      <div>
        {loading ? (
          <div aria-hidden="true">
            <span className="rf-sk fy-sk-title" />
            <span className="rf-sk fy-sk-card" />
          </div>
        ) : (
          <>
            <div className="rf-ptitle fy-ptitle">
              <h1>Your availability</h1>
              {term ? <span className="rf-pdate">{term}</span> : null}
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

// The line panel while it loads: the heading, the add line and eleven day rows as grey blocks.
export function FyLineSkel() {
  return (
    <div className="fy-skel" aria-hidden="true">
      <div className="rf-panel">
        <div className="fy-sk-ph">
          <span className="rf-sk" />
        </div>
        <div className="rf-pcard">
          <div className="fy-sk-add" />
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className="fy-sk-drow">
              <span className="rf-sk" />
              <span className="rf-sk" />
              <span className="rf-sk" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// The whole page while it loads (one sr-only h1 and one "Loading" status line for screen readers).
export function AvailabilitySkeleton({ live }: { live?: ReactNode }) {
  return (
    <div className="rf fy" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Your availability</h1>
      {live ?? (
        <p className="rf-sr" role="status">
          Loading your availability
        </p>
      )}
      <FyHead loading />
      <FyLineSkel />
    </div>
  );
}

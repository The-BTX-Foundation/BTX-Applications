// Cycle settings while it loads, plus the page header the skeleton shares with the real page (title, the term line, the
// news card, the laptop search look). Drawn by app/(shell)/(cycle-settings)/scholarships/cycle/settings/loading.tsx on
// every real navigation, by `?demo=loading` in mock mode, and in place of the error line while "Try again" reloads.
import '@/components/refresh/refresh.css';
import './cycle-settings-page.css';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// The page header: "Cycle settings" with the term line and its links beside it (or, while loading, grey blocks shaped like
// the title and the news card), the news card under it, and the search box's look on laptops.
export function CzHead({ sub, links, news, loading = false }: { sub?: string; links?: ReactNode; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head cz-head">
      <div>
        {loading ? (
          <div className="cz-sk-hl" aria-hidden="true">
            <Sk />
            <Sk />
          </div>
        ) : (
          <>
            <div className="rf-ptitle">
              <h1 id="cz-h1" tabIndex={-1}>
                Cycle settings
              </h1>
              {sub ? <span className="rf-pdate">{sub}</span> : null}
              {links}
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

// One grey settings card: a heading block, then `rows` rows (icon, value, the Edit link's place).
function SkCard({ rows }: { rows: number }) {
  return (
    <section className="cz-card">
      <div className="cz-sk-ph">
        <Sk />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="cz-sk-row">
          <Sk />
          <Sk />
          <Sk />
        </div>
      ))}
    </section>
  );
}

// The page's grey cards (two, like the demo).
export function CzSkelBody() {
  return (
    <div className="cz-skel" aria-hidden="true">
      <SkCard rows={2} />
      <SkCard rows={4} />
    </div>
  );
}

// The whole page while it loads.
export function CycleSettingsSkeleton() {
  return (
    <div className="rf cz" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Cycle settings</h1>
      <p className="rf-sr" role="status">
        Loading cycle settings
      </p>
      <CzHead loading />
      <CzSkelBody />
    </div>
  );
}

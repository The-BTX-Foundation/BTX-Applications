// The Cycle page while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(cycle)/scholarships/cycle/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and while
// "Try again" reloads. Also holds the header the page and the skeleton share.
import '@/components/refresh/refresh.css';
import './cycle.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';

/** Where the cycle's settings live (a separate page, built by its own builder). */
export const CY_SETTINGS = '/scholarships/cycle/settings';

// The page header: the title, the award and amount beside it, the settings link, the news card under it, and the search
// box on laptops. `loading` draws grey blocks in place of the title and the card.
export function CyHead({ title, sub, settings = true, news, loading = false }: { title?: string; sub?: string[]; settings?: boolean; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head cy-head">
      <div>
        {loading ? (
          <div className="cy-sk-hl" aria-hidden="true">
            <span className="cy-sk" />
            <span className="cy-sk" />
          </div>
        ) : (
          <>
            <div className="rf-ptitle cy-ptitle">
              <h1>{title}</h1>
              {sub && sub.length ? (
                <span className="rf-pdate cy-pdate">
                  {sub.map((p, i) => (
                    <span key={p}>
                      {i ? ' · ' : ''}
                      <span className={i ? 'rf-nowrap' : undefined}>{p}</span>
                    </span>
                  ))}
                </span>
              ) : null}
              {settings ? (
                <Link className="rf-lnk" href={CY_SETTINGS}>
                  Cycle settings
                </Link>
              ) : null}
            </div>
            {news}
          </>
        )}
      </div>
      <div className="rf-search cy-search" aria-hidden="true">
        <Icon name="search" />
        <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
      </div>
    </header>
  );
}

// The schedule and the checklist as grey blocks.
export function CyPanelsSkel() {
  return (
    <div className="cy-skel" aria-hidden="true">
      <section className="cy-box">
        <div className="cy-sk-ph">
          <span className="cy-sk" />
        </div>
        <span className="cy-sk cy-sk-ax" />
        <div className="cy-sk-st">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <span className="cy-sk" />
              <span className="cy-sk" />
            </div>
          ))}
        </div>
      </section>
      <section className="cy-box">
        <div className="cy-sk-ph">
          <span className="cy-sk" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cy-sk-row">
            <span className="cy-sk cy-c" />
            <span className="cy-sk" />
            <span className="cy-sk" />
          </div>
        ))}
      </section>
    </div>
  );
}

// The chat panel while it loads (used in place of its error line while "Try again" runs).
export function CyChatSkel() {
  return (
    <div className="cy-sk-chat" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="cy-sk-row">
          <span className="cy-sk cy-c" />
          <span className="cy-sk" />
        </div>
      ))}
    </div>
  );
}

// The whole page while it loads.
export function CycleSkeleton() {
  return (
    <div className="rf cy" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Cycle</h1>
      <p className="rf-sr" role="status">
        Loading the cycle
      </p>
      <CyHead loading />
      <CyPanelsSkel />
    </div>
  );
}

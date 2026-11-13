// Instagram while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(instagram)/outreach/instagram/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and in
// place of the error card while "Try again" reloads. Also holds the page's header and the phone's Outreach links, which the
// loaded page and the skeleton share.
import '@/components/refresh/refresh.css';
import './instagram.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';

/** The three Outreach pages, for the phone's links under the title (the sidebar lists them on laptops). */
const OUTREACH = [
  { href: '/outreach/plan', label: 'Plan' },
  { href: '/outreach/instagram', label: 'Instagram' },
  { href: '/outreach/newsletter', label: 'Newsletter' },
];

// The page header: the title with the date beside it, the news card under it, and the search look on laptops. `loading`
// draws grey blocks for the title and the card and keeps the h1 for screen readers only.
export function IgHead({ date, news, loading = false }: { date?: string; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head ig-head">
      <div>
        {loading ? (
          <>
            <h1 className="rf-sr">Instagram</h1>
            <div className="ig-sk-hl" aria-hidden="true">
              <span className="rf-sk ig-sk-title" />
              <span className="rf-sk ig-sk-card" />
            </div>
          </>
        ) : (
          <div className="rf-ptitle ig-ptitle">
            <h1>Instagram</h1>
            {date ? <span className="rf-pdate">{date}</span> : null}
          </div>
        )}
        {news}
      </div>
      <div className="rf-search" aria-hidden="true">
        <Icon name="search" />
        <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
      </div>
    </header>
  );
}

// The phone's Outreach links under the title (hidden on laptops, where the sidebar lists them).
export function OutreachNav() {
  return (
    <nav className="ig-secnav" aria-label="Outreach">
      {OUTREACH.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.href === '/outreach/instagram' ? 'page' : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

// One grey row: a mark, one or two lines, a short block at the end.
function SkRow({ two = true }: { two?: boolean }) {
  return (
    <div className="ig-sk-row">
      <span className="rf-sk" />
      <span className="ig-sk-lines">
        <span className="rf-sk" />
        {two ? <span className="rf-sk" /> : null}
      </span>
      <span className="rf-sk" />
    </div>
  );
}

// The list and the selected post as grey blocks (the second panel is hidden on phones).
export function IgBoardSk() {
  return (
    <div className="rf-board ig-board ig-skel" aria-hidden="true">
      <div className="ig-panel">
        <div className="ig-sk-ph">
          <span className="rf-sk" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkRow key={i} />
        ))}
      </div>
      <div className="ig-panel">
        <div className="rf-sk-box">
          <span className="rf-sk" style={{ width: '35%' }} />
          <span className="rf-sk" style={{ height: 24, width: '70%' }} />
        </div>
        {[0, 1, 2].map((i) => (
          <SkRow key={i} two={false} />
        ))}
        <div className="rf-sk-box">
          <span className="rf-sk" style={{ height: 96 }} />
        </div>
      </div>
    </div>
  );
}

// The whole page while it loads.
export function InstagramSkeleton() {
  return (
    <div className="rf ig" data-state="loading" aria-busy="true">
      <p className="rf-sr" role="status">
        Loading Instagram
      </p>
      <IgHead loading />
      <OutreachNav />
      <IgBoardSk />
    </div>
  );
}

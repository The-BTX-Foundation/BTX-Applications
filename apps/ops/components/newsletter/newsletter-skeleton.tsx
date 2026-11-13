// Newsletter while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(newsletter)/outreach/newsletter/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and in
// place of the error card while "Try again" reloads. Also holds the pieces the page and the skeleton share: the header
// (title, "Monthly email", the news card, the laptop search look) and the phone's Outreach links.
import '@/components/refresh/refresh.css';
import './newsletter.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// The page header: "Newsletter · Monthly email" (plus `extra`, the mock-only "Past issues" link and its note), the news card
// under it, and the search box's look on laptops. `loading` draws grey blocks for the title and the news card.
export function NlHead({ news, extra, loading = false }: { news?: ReactNode; extra?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head nl-head">
      <div>
        {loading ? (
          <div className="nl-sk-hl" aria-hidden="true">
            <Sk className="nl-sk-title" />
            <Sk className="nl-sk-card" />
          </div>
        ) : (
          <>
            <div className="rf-ptitle nl-ptitle">
              <h1>Newsletter</h1>
              <span className="rf-pdate">Monthly email</span>
              {extra}
            </div>
            {news}
          </>
        )}
      </div>
      <div className="rf-search nl-search" aria-hidden="true">
        <Icon name="search" />
        <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
      </div>
    </header>
  );
}

const OUTREACH = [
  { href: '/outreach/plan', label: 'Plan' },
  { href: '/outreach/instagram', label: 'Instagram' },
  { href: '/outreach/newsletter', label: 'Newsletter' },
];

// The phone's Outreach pages as light text tabs under the header (the sidebar lists them on laptops).
export function NlSecnav() {
  return (
    <nav className="nl-secnav" aria-label="Outreach">
      {OUTREACH.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.label === 'Newsletter' ? 'page' : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

// The board while it loads: the issue (a heading and five section rows) and the email preview (hidden on the phone).
export function NlBoardSkel() {
  return (
    <div className="nl-board nl-skel" aria-hidden="true">
      <div className="nl-skp">
        <div className="nl-sk-ph">
          <Sk />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="nl-sk-row">
            <Sk className="nl-c" />
            <span className="nl-lines">
              <Sk />
              <Sk />
            </span>
            <Sk />
          </div>
        ))}
      </div>
      <div className="nl-skp nl-skp-pv">
        <div className="nl-sk-ph">
          <Sk />
        </div>
        <div className="nl-sk-box">
          <Sk style={{ width: 90, height: 40 }} />
          <Sk style={{ height: 24, width: '80%' }} />
          <Sk />
          <Sk style={{ width: '60%' }} />
          <Sk />
          <Sk style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}

// The whole page while it loads.
export function NewsletterSkeleton() {
  return (
    <div className="rf nl" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Newsletter</h1>
      <p className="rf-sr" role="status">
        Loading newsletter
      </p>
      <NlHead loading />
      <NlSecnav />
      <NlBoardSkel />
    </div>
  );
}

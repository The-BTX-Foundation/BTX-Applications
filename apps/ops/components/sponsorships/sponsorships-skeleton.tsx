// Sponsorships while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(sponsorships)/programs/sponsorships/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and
// in place of the error card while "Try again" reloads. Also holds the page's header and the phone's Programs links, which
// the loaded page and the skeleton share.
import '@/components/refresh/refresh.css';
import './sponsorships.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sk } from '@/components/refresh/skeleton';

/** The three Programs pages, for the phone's links under the title (the sidebar lists them on laptops). */
const PROGRAMS = [
  { href: '/programs/certifications', label: 'Certifications' },
  { href: '/programs/sponsorships', label: 'Sponsorships' },
  { href: '/programs/mentorship', label: 'Mentorship' },
];

// The page header: the title with the year beside it and the news card under it. `loading` draws the grey title lines and
// keeps the h1 for screen readers only.
export function SponsorsHead({ year, news, loading = false }: { year?: number; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head sz-head">
      <div>
        {loading ? (
          <>
            <h1 className="rf-sr">Sponsorships</h1>
            <div className="sz-sk-hl" aria-hidden="true">
              <Sk />
              <Sk />
            </div>
          </>
        ) : (
          <div className="rf-ptitle">
            <h1>Sponsorships</h1>
            {year ? <span className="rf-pdate">{year}</span> : null}
          </div>
        )}
        {news}
      </div>
    </header>
  );
}

// The phone's Programs links under the title (hidden on laptops, where the sidebar lists them).
export function ProgramsNav() {
  return (
    <nav className="sz-secnav" aria-label="Programs">
      {PROGRAMS.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.href === '/programs/sponsorships' ? 'page' : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

// Grey rows shaped like sponsorship rows: icon, two lines, the amount.
export function SponsorSkRows({ n }: { n: number }) {
  const w1 = [62, 48, 70, 54, 44];
  const w2 = [38, 30, 42, 34, 28];
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sz-sk-row" aria-hidden="true">
          <Sk className="sz-c" />
          <span className="sz-lines">
            <Sk style={{ width: `${w1[i % 5]}%`, height: 16 }} />
            <Sk style={{ width: `${w2[i % 5]}%` }} />
          </span>
          <Sk />
        </div>
      ))}
    </>
  );
}

// The year panel's grey blocks: the heading line, the column strip, three rows.
export function SponsorsListSk() {
  return (
    <section className="rf-panel sz-panel" aria-hidden="true">
      <div className="rf-ph">
        <Sk style={{ width: 70, height: 18 }} />
      </div>
      <div className="rf-pcard">
        <div className="sz-cols" />
        <SponsorSkRows n={3} />
      </div>
    </section>
  );
}

// "How a sponsorship works" as grey blocks: the heading and four numbered steps.
export function SponsorsHowSk() {
  return (
    <section className="rf-panel sz-panel sz-how" aria-hidden="true">
      <div className="rf-ph">
        <Sk style={{ width: 200, height: 18 }} />
      </div>
      <div className="rf-pcard">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sz-how-sk">
            <Sk className="sz-how-sk-n" />
            <span className="sz-how-sk-l">
              <Sk style={{ width: '60%', height: 16 }} />
              <Sk style={{ width: '85%' }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// The whole page while it loads.
export function SponsorshipsSkeleton() {
  return (
    <div className="rf sz" data-state="loading" aria-busy="true">
      <p className="rf-sr" role="status">
        Loading sponsorships
      </p>
      <SponsorsHead loading />
      <ProgramsNav />
      <div className="rf-board sz-board">
        <div className="rf-col">
          <SponsorsListSk />
        </div>
        <div className="rf-col">
          <SponsorsHowSk />
        </div>
      </div>
    </div>
  );
}

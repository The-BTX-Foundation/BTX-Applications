// Mentorship while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(mentorship)/programs/mentorship/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and in
// place of the error card while "Try again" reloads. Also holds the pieces the page and the skeleton share: the header
// and the phone's Programs links.
import '@/components/refresh/refresh.css';
import './mentorship.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

// The page header: "Mentorship" with the program's status beside it, the news card under it. `loading` draws grey blocks.
export function MsHead({ status, news, loading = false }: { status?: string; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head ms-head">
      <div>
        {loading ? (
          <>
            <span className="ms-sk ms-sk-title" aria-hidden="true" />
            <span className="ms-sk ms-sk-card" aria-hidden="true" />
          </>
        ) : (
          <>
            <div className="rf-ptitle ms-ptitle">
              <h1>Mentorship</h1>
              {status ? <span className="rf-pdate">{status}</span> : null}
            </div>
            {news}
          </>
        )}
      </div>
    </header>
  );
}

const PROGRAMS = [
  { href: '/programs/certifications', label: 'Certifications' },
  { href: '/programs/sponsorships', label: 'Sponsorships' },
  { href: '/programs/mentorship', label: 'Mentorship' },
];

// The phone's Programs pages as light text tabs under the header (the sidebar lists them on laptops).
export function MsSecnav() {
  return (
    <nav className="ms-secnav" aria-label="Programs">
      {PROGRAMS.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.label === 'Mentorship' ? 'page' : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

const TOP = ['24%', '20%', '26%', '22%', '18%'];
const LOW = ['62%', '48%', '70%', '54%', '44%'];

// "Where it stands" while it loads: the heading and the progress bar as grey blocks, then five step rows.
export function MsListSkel() {
  return (
    <section className="rf-panel ms-panel" aria-hidden="true">
      <div className="rf-ph ms-ph">
        <span className="ms-sk" style={{ width: 150, height: 18 }} />
        <span className="ms-sk" style={{ width: 140, height: 10 }} />
      </div>
      <div className="rf-pcard">
        {TOP.map((w, i) => (
          <div key={i} className="ms-sk-row">
            <span className="ms-sk ms-c" />
            <span className="ms-lines">
              <span className="ms-sk" style={{ width: w }} />
              <span className="ms-sk" style={{ width: LOW[i], height: 16 }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// The chat panel while it loads: the heading, three messages and the reply box as grey blocks.
export function MsChatSkel() {
  return (
    <section className="rf-panel ms-panel ms-chat" aria-hidden="true">
      <div className="rf-ph ms-ph">
        <span className="ms-sk" style={{ width: 150, height: 18 }} />
      </div>
      <div className="rf-pcard">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ms-msg">
            <span className="ms-sk" style={{ width: 36, height: 36 }} />
            <span className="ms-lines">
              <span className="ms-sk" style={{ width: '40%' }} />
              <span className="ms-sk" style={{ width: '85%' }} />
            </span>
          </div>
        ))}
        <div className="ms-reply ms-reply-sk" />
      </div>
    </section>
  );
}

// The whole page while it loads.
export function MentorshipSkeleton() {
  return (
    <div className="rf ms" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Mentorship</h1>
      <p className="rf-sr" role="status">
        Loading mentorship
      </p>
      <MsHead loading />
      <MsSecnav />
      <div className="rf-board ms-board">
        <div className="rf-col">
          <MsListSkel />
        </div>
        <div className="rf-col">
          <MsChatSkel />
        </div>
      </div>
    </div>
  );
}

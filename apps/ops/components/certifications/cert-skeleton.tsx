// Certifications while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(certifications)/programs/certifications/loading.tsx on every real navigation, by `?demo=loading` in mock
// mode, and (the checklist part) in place of the error card while "Try again" reloads.
import '@/components/refresh/refresh.css';
import './certifications.css';
import Link from 'next/link';
import { Sk } from '@/components/refresh/skeleton';

const W1 = [62, 48, 70, 54, 44];
const W2 = [38, 30, 42, 34, 28];

/** The phone's Programs tabs (Certifications, Sponsorships, Mentorship); hidden on laptops, where the sidebar lists them. */
export function CertSecNav() {
  return (
    <nav className="cf-secnav" aria-label="Programs">
      <Link href="/programs/certifications" aria-current="page">
        Certifications
      </Link>
      <Link href="/programs/sponsorships">Sponsorships</Link>
      <Link href="/programs/mentorship">Mentorship</Link>
    </nav>
  );
}

// The plan strip's grey blocks.
export function CertSkelPlan() {
  return (
    <section className="rf-panel" aria-hidden="true">
      <div className="rf-pcard">
        <div className="cf-pl">
          <Sk style={{ width: 126, height: 22 }} />
          <span className="cf-pl-sk">
            <Sk style={{ width: '55%', height: 16 }} />
            <Sk style={{ width: '40%' }} />
          </span>
        </div>
      </div>
    </section>
  );
}

/** The checklist's grey blocks: the heading and the bar, then five step rows. */
export function CertSkelList() {
  return (
    <section className="rf-panel" aria-hidden="true">
      <div className="rf-ph">
        <Sk style={{ width: 160, height: 18 }} />
        <Sk style={{ width: 140, height: 10 }} />
      </div>
      <div className="rf-pcard">
        {W1.map((w, i) => (
          <div key={i} className="cf-sk-row">
            <Sk className="cf-c" />
            <span className="cf-lines">
              <Sk style={{ width: `${w}%`, height: 16 }} />
              <Sk style={{ width: `${W2[i]}%` }} />
            </span>
            <Sk />
          </div>
        ))}
      </div>
    </section>
  );
}

// The chat's grey blocks: the heading, three messages and the dashed field.
function CertSkelChat() {
  return (
    <section className="rf-panel cf-chat" aria-hidden="true">
      <div className="rf-ph">
        <Sk style={{ width: 150, height: 18 }} />
      </div>
      <div className="rf-pcard">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cf-msg">
            <Sk style={{ width: 36, height: 36 }} />
            <span className="cf-lines">
              <Sk style={{ width: '40%' }} />
              <Sk style={{ width: '85%' }} />
            </span>
          </div>
        ))}
        <div className="cf-reply cf-sk-reply" />
      </div>
    </section>
  );
}

// The whole page while it loads.
export function CertSkeleton() {
  return (
    <div className="rf cf" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Certifications</h1>
      <p className="rf-sr" role="status">
        Loading certifications
      </p>
      <header className="rf-head">
        <div>
          <div className="cf-sk-hl" aria-hidden="true">
            <Sk />
            <Sk />
          </div>
        </div>
      </header>
      <CertSecNav />
      <div className="rf-board">
        <div className="rf-col">
          <CertSkelPlan />
          <CertSkelList />
        </div>
        <div className="rf-col">
          <CertSkelChat />
        </div>
      </div>
    </div>
  );
}

// Outreach Plan while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(oplan)/outreach/plan/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and while
// "Try again" reloads after a load error. Also the phone's Outreach tabs (Plan, Instagram, Newsletter).
import '@/components/refresh/refresh.css';
import './oplan.css';
import Link from 'next/link';
import { PageHeader } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

/** The phone's Outreach tabs; hidden on laptops, where the sidebar lists them. */
export function OplanSecNav() {
  return (
    <nav className="pn-secnav" aria-label="Outreach">
      <Link href="/outreach/plan" aria-current="page">
        Plan
      </Link>
      <Link href="/outreach/instagram">Instagram</Link>
      <Link href="/outreach/newsletter">Newsletter</Link>
    </nav>
  );
}

// One skeleton list row: the icon, a title and a meta line, the progress.
function SkRow() {
  return (
    <div className="pn-skrow">
      <Sk />
      <span className="pn-lines">
        <Sk />
        <Sk />
      </span>
      <Sk />
    </div>
  );
}

// A skeleton panel heading.
function SkHead() {
  return (
    <div className="rf-sk-ph">
      <Sk />
    </div>
  );
}

/** The board's grey blocks: the needs card and the month (four rows) on the left, a short list (two rows) on the right. */
export function OplanSkelBoard() {
  return (
    <div className="rf-board pn-board" aria-hidden="true">
      <div className="rf-col pn-cola">
        <div className="pn-skp">
          <div className="pn-skbox">
            <Sk style={{ width: '40%' }} />
            <Sk style={{ width: '70%' }} />
            <Sk style={{ height: 36, width: 140 }} />
          </div>
        </div>
        <div className="pn-skp">
          <SkHead />
          <div className="pn-skbox">
            <Sk style={{ height: 40 }} />
          </div>
          <SkRow />
          <SkRow />
          <SkRow />
          <SkRow />
        </div>
      </div>
      <div className="rf-col pn-colb">
        <div className="pn-skp">
          <SkHead />
          <SkRow />
          <SkRow />
        </div>
      </div>
    </div>
  );
}

// The whole page while it loads.
export function OplanSkeleton() {
  return (
    <div className="rf pn" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Outreach</h1>
      <p className="rf-sr" role="status">
        Loading the outreach plan
      </p>
      <PageHeader loading>
        <div className="pn-sk-hl" aria-hidden="true">
          <Sk />
        </div>
      </PageHeader>
      <OplanSecNav />
      <OplanSkelBoard />
    </div>
  );
}

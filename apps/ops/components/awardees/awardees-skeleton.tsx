// Awardees while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(awardees)/scholarships/awardees/loading.tsx on every real navigation, by `?demo=loading` in mock mode, and in
// place of the error card while "Try again" reloads. Also holds the header the page and the skeleton share.
import '@/components/refresh/refresh.css';
import './awardees.css';
import type { ReactNode } from 'react';

// The page header: "Awardees" with the term (before the award) or today's date beside it, the news card under it.
// `loading` draws grey blocks in their place.
export function AwHead({ pdate, news, loading = false }: { pdate?: string; news?: ReactNode; loading?: boolean }) {
  if (loading) {
    return (
      <header className="aw-head" aria-hidden="true">
        <div className="aw-sk-hl">
          <span className="aw-sk" />
          <span className="aw-sk" />
        </div>
      </header>
    );
  }
  return (
    <header className="aw-head">
      <div>
        <div className="aw-ptitle">
          <h1 id="aw-pt" tabIndex={-1}>
            Awardees
          </h1>
          {pdate ? <span className="aw-pdate">{pdate}</span> : null}
        </div>
        {news}
      </div>
    </header>
  );
}

// One grey list row: the icon, two lines, two short blocks.
function SkRow() {
  return (
    <div className="aw-sk-row">
      <span className="aw-sk aw-sk-t" />
      <span className="aw-lines">
        <span className="aw-sk" />
        <span className="aw-sk" />
      </span>
      <span className="aw-sk" />
      <span className="aw-sk" />
    </div>
  );
}

// The page body while it loads: the list with two rows, the detail beside it (wide laptops), and the past list.
export function AwBodySkel() {
  return (
    <>
      <div className="aw-work" aria-hidden="true">
        <section className="aw-card">
          <div className="aw-sk-box">
            <span className="aw-sk" style={{ width: 160, height: 20 }} />
          </div>
          <SkRow />
          <SkRow />
        </section>
        <section className="aw-card aw-aside">
          <div className="aw-sk-box">
            <span className="aw-sk" style={{ width: 180, height: 22 }} />
            <span className="aw-sk" />
            <span className="aw-sk" style={{ width: '60%' }} />
            <span className="aw-sk" />
            <span className="aw-sk" style={{ width: '70%' }} />
          </div>
        </section>
      </div>
      <section className="aw-card aw-block" aria-hidden="true">
        <SkRow />
        <SkRow />
        <SkRow />
        <SkRow />
      </section>
    </>
  );
}

// The whole page while it loads.
export function AwardeesSkeleton() {
  return (
    <div className="rf aw" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Awardees</h1>
      <p className="rf-sr" role="status">
        Loading awardees
      </p>
      <AwHead loading />
      <AwBodySkel />
    </div>
  );
}

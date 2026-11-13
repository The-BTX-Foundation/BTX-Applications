// Selection while it loads: grey blocks shaped like the page (the demo's loading state), no spinner. Drawn by
// app/(shell)/(selection)/scholarships/selection/loading.tsx on every real navigation, by `?demo=loading` in mock mode,
// and in place of the error card while "Try again" reloads. Also holds the header the page and the skeleton share.
import '@/components/refresh/refresh.css';
import './selection.css';
import type { ReactNode } from 'react';

// The page header: "Selection" with the meeting time or the term beside it, the news card under it, and on laptops the
// "Join the call" tools to the right (`tools`; phones draw them under the news as `join`).
export function SlHead({ pdate, news, tools, join }: { pdate?: string; news?: ReactNode; tools?: ReactNode; join?: ReactNode }) {
  return (
    <header className="sl-head">
      <div>
        <div className="sl-ptitle">
          <h1 id="sl-pt" tabIndex={-1}>
            Selection
          </h1>
          {pdate ? <span className="sl-pdate">{pdate}</span> : null}
        </div>
        {news}
        {join}
      </div>
      {tools}
    </header>
  );
}

// One grey ranking row.
function SkRow() {
  return (
    <div className="sl-sk-row">
      <span className="sl-sk" />
      <span className="sl-lines">
        <span className="sl-sk" />
        <span className="sl-sk" />
      </span>
      <span className="sl-sk" />
      <span className="sl-sk" />
    </div>
  );
}

// The page while it loads: the header blocks, the ranking with six rows, the decisions box.
export function SlBodySkel() {
  return (
    <>
      <header className="sl-head" aria-hidden="true">
        <div className="sl-sk-hl">
          <span className="sl-sk" />
          <span className="sl-sk" />
        </div>
      </header>
      <div className="sl-work" aria-hidden="true">
        <section className="sl-card">
          <div className="sl-sk-box">
            <span className="sl-sk" style={{ width: 220, height: 20 }} />
          </div>
          <SkRow />
          <SkRow />
          <SkRow />
          <SkRow />
          <SkRow />
          <SkRow />
        </section>
        <section className="sl-card sl-dec">
          <div className="sl-sk-box">
            <span className="sl-sk" style={{ width: 140, height: 20 }} />
            <span className="sl-sk" />
            <span className="sl-sk" style={{ width: '60%' }} />
            <span className="sl-sk" style={{ height: 40 }} />
          </div>
        </section>
      </div>
    </>
  );
}

// The whole page while it loads.
export function SelectionSkeleton() {
  return (
    <div className="rf sl" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Selection</h1>
      <p className="rf-sr" role="status">
        Loading Selection
      </p>
      <SlBodySkel />
    </div>
  );
}

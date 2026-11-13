// The Scoring page while it loads (the demo's ?state=loading): the title and news card as grey blocks, the queue's three
// rows, the score sheet's top and four rows, the notes' two rows. Grey blocks shaped like the page, no spinner. Also the
// board's "didn't load" card (the demo's ?state=error), drawn under the real title.
import '@/components/refresh/refresh.css';
import './scoring.css';
import { PageHeader } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// `n` grey rows: a title line and a meta line.
function Rows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sc-sk-row">
          <Sk style={{ width: '60%', height: 18 }} />
          <Sk style={{ width: '40%', height: 12, marginTop: 10 }} />
        </div>
      ))}
    </>
  );
}

// The whole page while it loads.
export function ScoringSkeleton() {
  return (
    <div className="rf sc" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Scoring</h1>
      <p className="rf-sr" role="status">
        Loading your scores
      </p>
      <header className="rf-head" aria-hidden="true">
        <div>
          <div className="rf-ptitle">
            <Sk style={{ width: 180, height: 30 }} />
          </div>
          <Sk className="sc-sk-news" />
        </div>
      </header>
      <div className="sc-board" aria-hidden="true">
        <section className="sc-qp">
          <div className="sc-ph">
            <h2>Your queue</h2>
          </div>
          <div className="sc-pcard">
            <Rows n={3} />
          </div>
        </section>
        <section className="sc-panel sc-sheet">
          <div className="sc-sh-top">
            <Sk style={{ width: '50%', height: 24 }} />
            <Sk style={{ width: '100%', height: 10, marginTop: 20 }} />
          </div>
          <Rows n={4} />
        </section>
        <aside className="sc-notes">
          <div className="sc-ph">
            <h2>Interview notes</h2>
          </div>
          <div className="sc-pcard">
            <Rows n={2} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// The board's "didn't load" card under the real title: the drafts are safe, Try again reads the page again.
export function ScoringLoadError({ date }: { date: string }) {
  return (
    <div className="rf sc" data-state="error">
      <PageHeader title="Scoring" date={date} search={false} />
      <div className="sc-board">
        <section className="sc-panel sc-errcard">
          <div className="sc-err" role="alert">
            <p>Your scores didn&apos;t load. Your drafts are safe.</p>
            <a className="rf-btn" href="?">
              Try again
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

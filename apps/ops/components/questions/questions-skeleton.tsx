// Interview questions while it loads, plus the header the skeleton shares with the real page (the title with the term,
// the news card under it, the laptop search look). Drawn by app/(shell)/(questions)/scholarships/interviews/questions/
// loading.tsx on every real navigation, by `?demo=loading` in mock mode, and in place of the error card while "Try again"
// reloads.
import '@/components/refresh/refresh.css';
import './questions.css';
import type { ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { SEARCH_PLACEHOLDER } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// The page header: the title with the term (or, while loading, grey blocks shaped like the title and the news card), the
// news card under it, and the search box's look on laptops.
export function QnHead({ term, news, loading = false }: { term?: string | null; news?: ReactNode; loading?: boolean }) {
  return (
    <header className="rf-head qn-head">
      <div>
        {loading ? (
          <div className="qn-sk-hl" aria-hidden="true">
            <Sk />
            <Sk />
          </div>
        ) : (
          <>
            <div className="rf-ptitle">
              <h1 id="qn-h1" tabIndex={-1}>
                Interview questions
              </h1>
              {term ? <span className="rf-pdate">{term}</span> : null}
            </div>
            {news}
          </>
        )}
      </div>
      <div className="rf-search" aria-hidden="true">
        <Icon name="search" />
        <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
      </div>
    </header>
  );
}

// The board's grey blocks: the questions panel (four groups) beside the next-interview ticket.
export function QnSkelBoard() {
  return (
    <div className="qn-board" aria-hidden="true">
      <section className="rf-panel qn-qs">
        <div className="qn-sk-ph">
          <Sk />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="qn-sk-grp">
            <Sk />
            <Sk />
            <Sk />
          </div>
        ))}
      </section>
      <section className="rf-panel qn-sknext">
        <div className="qn-sk-ph">
          <Sk />
        </div>
        <div className="rf-pcard">
          <Sk className="qn-sk-tk" />
        </div>
      </section>
    </div>
  );
}

// The whole page while it loads.
export function QuestionsSkeleton() {
  return (
    <div className="rf qn" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Interview questions</h1>
      <p className="rf-sr" role="status">
        Loading the interview questions
      </p>
      <QnHead loading />
      <QnSkelBoard />
    </div>
  );
}

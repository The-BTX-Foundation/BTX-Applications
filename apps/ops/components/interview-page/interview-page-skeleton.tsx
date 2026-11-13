// The page for one interview while it loads: the title as a grey block, the join card's shape, the interviewers and the
// questions with grey rows. No spinner. Screen readers get the page's h1 and one "Loading the interview" status line.
import { PageHeader } from '@/components/refresh/page-header';
import { Sk, SkRows } from '@/components/refresh/skeleton';
import '@/components/refresh/refresh.css';
import './interview-page.css';

// The skeleton.
export function InterviewPageSkeleton() {
  return (
    <div className="rf ip" aria-busy="true">
      <h1 className="rf-sr">Interview</h1>
      <p className="rf-sr" role="status">
        Loading the interview
      </p>
      <PageHeader search={false} loading />
      <div className="ip-grid" aria-hidden="true">
        <div className="ip-side">
          <div className="rf-pcard">
            <Sk className="ip-sk-join" />
          </div>
          <section>
            <div className="ip-sk-ph">
              <Sk />
            </div>
            <div className="rf-pcard">
              <SkRows n={2} />
            </div>
          </section>
        </div>
        <div className="ip-main">
          <section>
            <div className="ip-sk-ph">
              <Sk />
            </div>
            <div className="rf-pcard">
              <SkRows n={6} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

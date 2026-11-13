// The Interviews page while it loads (the demo's Loading state): the title as a grey block, the gold card's shape, the
// calendar box, and the Booked and Board panels with grey rows. No spinner. Screen readers get the page's h1 and one
// "Loading Interviews" status line.
import { PageHeader } from '@/components/refresh/page-header';
import { Sk, SkRows } from '@/components/refresh/skeleton';
import '@/components/refresh/refresh.css';
import './interviews.css';

// The skeleton.
export function InterviewsSkeleton() {
  return (
    <div className="rf iz" aria-busy="true">
      <h1 className="rf-sr">Interviews</h1>
      <p className="rf-sr" role="status">
        Loading Interviews
      </p>
      <PageHeader search={false} loading />
      <div className="iz-board" aria-hidden="true">
        <Sk className="iz-span iz-sk-needs" />
        <section className="iz-span">
          <div className="iz-sk-ph">
            <Sk />
          </div>
          <div className="rf-pcard">
            <Sk className="iz-sk-cal" />
          </div>
        </section>
        <section>
          <div className="iz-sk-ph">
            <Sk />
          </div>
          <div className="rf-pcard">
            <SkRows n={4} />
          </div>
        </section>
        <section>
          <div className="iz-sk-ph">
            <Sk />
          </div>
          <div className="rf-pcard">
            <SkRows n={5} />
          </div>
        </section>
      </div>
    </div>
  );
}

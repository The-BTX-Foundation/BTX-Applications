// The Applicants pages while they load: the list's seven grey rows (the demo's loading state, also drawn inside the list
// card while "Try again" reloads), the whole list page (app/(shell)/(applicants)/scholarships/applicants/loading.tsx) and
// the full application (its [code]/loading.tsx). Grey blocks shaped like the page, no spinner.
import '@/components/refresh/refresh.css';
import './applicants.css';
import { Sk } from '@/components/refresh/skeleton';

const W = [46, 38, 52, 34, 44, 40, 50];

// Seven grey list rows: the initials circle, the name and code lines, the stage, the score.
export function ApSkelRows() {
  return (
    <div aria-hidden="true">
      {W.map((w, i) => (
        <div key={i} className="ap-ar ap-sk-row">
          <Sk className="ap-av ap-sk-av" />
          <span className="ap-who">
            <Sk style={{ width: `${w}%`, height: 16 }} />
            <Sk style={{ width: '60%', marginTop: 8 }} />
          </span>
          <span className="ap-stage">
            <Sk style={{ width: 120, height: 8 }} />
            <Sk style={{ width: 90 }} />
          </span>
          <span className="ap-score">
            <Sk style={{ width: 64 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// The whole list page while it loads.
export function ApplicantsSkeleton() {
  return (
    <div className="rf ap" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Applicants</h1>
      <p className="rf-sr" role="status">
        Loading applicants
      </p>
      <div className="rf-sk-hl ap-sk-hl" aria-hidden="true">
        <Sk />
      </div>
      <div className="ap-needs ap-sk-needs" aria-hidden="true">
        <Sk style={{ width: 90, height: 18 }} />
        <Sk className="ap-sk-bar" />
      </div>
      <div className="rf-sk-tabs ap-sk-tabs" aria-hidden="true">
        <Sk />
        <Sk />
        <Sk />
        <Sk />
      </div>
      <div className="ap-work">
        <section className="ap-alist" aria-hidden="true">
          <ApSkelRows />
        </section>
      </div>
    </div>
  );
}

// The full application while it loads: the back line, the name, the steps card and two columns of grey cards.
export function ApplicantDetailSkeleton() {
  return (
    <div className="rf ap ap-detail" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Application</h1>
      <p className="rf-sr" role="status">
        Loading the application
      </p>
      <div aria-hidden="true">
        <Sk className="ap-sk-back" />
        <Sk className="ap-sk-name" />
        <div className="ap-card ap-stagecard">
          <div className="ap-card-in">
            <Sk className="ap-sk-bar" />
          </div>
        </div>
        <div className="ap-dgrid">
          <div className="ap-dcol">
            <div className="ap-card-in ap-sk-card">
              <Sk style={{ width: '40%' }} />
              <Sk style={{ width: '70%' }} />
              <Sk style={{ width: '55%' }} />
            </div>
          </div>
          <div className="ap-dcol">
            <div className="ap-card-in ap-sk-card">
              <Sk style={{ width: '50%' }} />
              <Sk style={{ width: '65%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

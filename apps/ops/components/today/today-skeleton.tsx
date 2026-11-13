// Today while it loads: grey blocks shaped like the page (needs card, tasks, tickets, areas, chat), no spinner. Drawn by
// app/(shell)/(today)/loading.tsx on every real navigation to "/" (a click shows something at once) and by `?demo=loading` in mock mode.
import '@/components/refresh/refresh.css';
import './today.css';
import { PageHeader } from '@/components/refresh/page-header';
import { Sk, SkPanelHead, SkRows, SkTabs } from '@/components/refresh/skeleton';

// The skeleton tasks block (also used while "Try again" reloads the tasks).
export function TaskRowsSkeleton() {
  return (
    <>
      <SkTabs hidden />
      <div aria-hidden="true">
        <SkRows n={3} />
      </div>
    </>
  );
}

// The whole page.
export function TodaySkeleton() {
  return (
    <div className="rf td" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Today</h1>
      <p className="rf-sr" role="status">
        Loading Today
      </p>
      <PageHeader loading />
      <div className="rf-board td-skboard" aria-hidden="true">
        <div className="rf-col td-col-a">
          <div className="rf-panel rf-sk-box">
            <Sk style={{ width: '40%', height: 18 }} />
            <Sk className="rf-sk-bar" />
            <Sk style={{ width: '22%' }} />
          </div>
          <div className="rf-panel">
            <SkPanelHead />
            <SkTabs />
            <SkRows n={5} />
          </div>
        </div>
        <div className="rf-col td-col-b">
          <div className="rf-panel">
            <SkPanelHead />
            <div className="td-sk-tks">
              {[0, 1].map((i) => (
                <div key={i} className="td-sk-tk">
                  <Sk className="td-sk-stub" />
                  <span className="rf-lines">
                    <Sk style={{ width: '70%', height: 16 }} />
                    <Sk />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rf-panel">
            <SkPanelHead />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="td-sk-area">
                <Sk />
                <Sk className="rf-sk-bar" />
              </div>
            ))}
          </div>
          <div className="rf-panel">
            <SkPanelHead />
            <div className="td-sk-msg">
              <Sk className="rf-av" />
              <span className="rf-lines">
                <Sk style={{ width: '45%' }} />
                <Sk style={{ width: '85%' }} />
              </span>
            </div>
            <div className="td-sk-reply" />
          </div>
        </div>
      </div>
    </div>
  );
}

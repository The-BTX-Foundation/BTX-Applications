// Tasks while its server data loads (app/(shell)/(tasks)/loading.tsx): grey blocks shaped like the page (title, news
// card, the card with its tabs, filter chip and five rows), no spinner. A screen-reader-only h1 names the page and a
// status line says it is loading; everything drawn is hidden from screen readers. (`?demo=loading` in mock mode draws the
// real board with only its list loading, as the demo does: see TasksBoard's `loading`.)
import '@/components/refresh/refresh.css';
import './tasks.css';
import { Sk, SkTabs } from '@/components/refresh/skeleton';

// Five grey rows shaped like task rows (also the board's loading list).
export function TaskSkelRows() {
  return (
    <>
      <div className="rf-grp">&nbsp;</div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="tk-skel">
          <span />
          <span className="tk-two">
            <i />
            <i />
          </span>
          <span />
        </div>
      ))}
    </>
  );
}

// The whole page.
export function TasksSkeleton() {
  return (
    <div className="rf tk" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Tasks</h1>
      <p className="rf-sr" role="status">
        Loading tasks
      </p>
      <header className="rf-head" aria-hidden="true">
        <div>
          <div className="rf-sk-hl">
            <span className="rf-sk" />
          </div>
          <span className="tk-sknx" />
        </div>
      </header>
      <div className="tk-card" aria-hidden="true">
        <SkTabs hidden />
        <div className="tk-filters">
          <Sk style={{ width: 110, height: 36 }} />
        </div>
        <TaskSkelRows />
      </div>
    </div>
  );
}

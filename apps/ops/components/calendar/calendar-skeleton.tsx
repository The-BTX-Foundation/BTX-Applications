// Calendar while it loads: grey blocks shaped like the page (the news card, the "Needs you" card, the toolbar, then the month
// grid on laptops or the list on phones), no spinner. Drawn by app/(shell)/(calendar)/calendar/loading.tsx on every real
// navigation to /calendar and by `?demo=loading` in mock mode. Demo reference: the `.skel` block in
// apps/design/ops-refresh/directions/p-calendar/index.html.
import '@/components/refresh/refresh.css';
import './calendar.css';
import { PageHeader } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';

// The calendar panel's blocks (also drawn inside the panel while "Try again" reloads it).
export function CalPanelSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="cal-sk-tools">
        <Sk />
        <Sk />
      </div>
      <div className="cal-sk-grid">
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="cal-sk-list">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cal-sk-row">
            <Sk />
            <span className="cal-lines">
              <Sk />
              <Sk />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The whole page.
export function CalendarSkeleton() {
  return (
    <div className="rf cal cal-skel" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Calendar</h1>
      <p className="rf-sr" role="status">
        Loading Calendar
      </p>
      <PageHeader loading search={false}>
        <Sk className="cal-sk-news" />
      </PageHeader>
      <div aria-hidden="true">
        <div className="cal-sk-needs">
          <Sk />
          <Sk />
        </div>
        <div className="cal-panel">
          <CalPanelSkeleton />
        </div>
      </div>
    </div>
  );
}

// Calendar: one month grid of cycle dates, interviews, events, posts and due dates (Figma "Calendar", laptop and phone).
// MOCK data today (mock/calendar.ts); ?demo=stress draws the crowded-day frames and ?demo=error the "didn't load" card.
import type { Metadata } from 'next';
import { CalendarView } from '@/components/calendar/calendar-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadCalendar } from '@/lib/calendar';

export const metadata: Metadata = { title: 'Calendar' };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadCalendar({ demo });
  if (data.failed) {
    return (
      <div className="ca">
        <div className="o-lg">
          <PageHeader title="Calendar" />
        </div>
        <h1 className="ca-errh o-ph">October 2026</h1>
        <LoadError what="Calendar" />
      </div>
    );
  }
  return <CalendarView data={data} />;
}

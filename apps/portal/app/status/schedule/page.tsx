// Schedule your interview. `?demo=schedule` (and `taken`, with `-stress`) draw the drafts' states in mock mode.
// Live: `?taken=<time>` shows the "was just taken" notice after switch_booking answered 'taken'.
import type { Metadata } from 'next';
import { ApplyLoadError } from '@/components/load-error-pages';
import { ScheduleView } from '@/components/schedule-view';
import { easternDate } from '@/lib/format';
import { journeyLinks } from '@/lib/journey-demo';
import { clock, dayLabel } from '@/lib/journey';
import { et } from '@/lib/journey-demo';
import { loadJourney } from '@/lib/journey-data';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Schedule your interview' };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ demo?: string; taken?: string }> }) {
  const { demo, taken } = await searchParams;
  const d = await loadJourney('/status/schedule', demo, 'schedule');
  if ('failed' in d) return <ApplyLoadError status />;
  // she already holds a time: changing it is the other page
  if (!d.mock && d.booking) redirect('/status/change');
  const takenAt = taken && !Number.isNaN(Date.parse(taken)) ? taken : undefined;
  const demoTaken = d.mock && d.demoName?.startsWith('taken') ? (d.stress ? 'Wednesday, September 30 at 9:30 PM' : 'Tue Oct 6 at 6:00 PM') : null;
  const demoAt = demoTaken ? (d.stress ? et('2026-09-30', 21, 30) : et('2026-10-06', 18)) : undefined;
  const takenLabel = takenAt ? `${dayLabel(takenAt)} at ${clock(takenAt)}` : demoTaken;
  return (
    <ScheduleView
      accountName={d.fullName}
      slots={d.slots}
      today={easternDate(d.now)}
      interviewStart={d.view.drawing?.interviewStart ?? null}
      interviewEnd={d.view.drawing?.interviewEnd ?? null}
      preselect={d.preselect}
      takenLabel={takenLabel}
      takenAt={takenAt ?? demoAt ?? null}
      noTimeHref={journeyLinks(d.mock ? (d.demoName ?? '') : null).noTime}
      stress={d.stress}
    />
  );
}

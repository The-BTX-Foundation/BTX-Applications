// None of these times work. `?demo=no-time` (and `-stress`) draws the drafts' state in mock mode.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ApplyLoadError } from '@/components/load-error-pages';
import { NoTimeView } from '@/components/no-time-view';
import { loadJourney } from '@/lib/journey-data';
import { freeWindow } from '@/lib/journey';
import { easternDate } from '@/lib/format';
import { journeyLinks } from '@/lib/journey-demo';

export const metadata: Metadata = { title: 'Tell us when you’re free' };

export default async function NoTimePage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadJourney('/status/no-time', demo, 'no-time');
  if ('failed' in d) return <ApplyLoadError status />;
  // she already holds a time (the database refuses free times then): changing it is the other page
  if (!d.mock && d.booking) redirect('/status/change');
  const sample = d.mock && d.demoName?.startsWith('no-time');
  const win = freeWindow(easternDate(d.now), d.view.drawing?.interviewStart ?? null, d.view.drawing?.interviewEnd ?? null);
  // the stress demo opens on a long list of times; otherwise she starts from what she already sent, if anything
  const stressRanges = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21', '2026-09-22'].map((day) => ({ day, start: '18:00', end: '21:00' }));
  return (
    <NoTimeView
      accountName={d.fullName}
      slots={sample && d.stress ? [] : d.slots}
      scheduleHref={journeyLinks(d.mock ? (d.demoName ?? '') : null).schedule}
      initialRanges={sample ? (d.stress ? stressRanges : []) : (d.freeTimes?.ranges ?? [])}
      initialSaid={sample ? (d.stress ? 'Weekday evenings, and Sunday.' : '') : (d.freeTimes?.ranges?.length ? d.freeTimes.note : '')}
      windowStart={win.start}
      windowEnd={win.end}
      applicationId={d.applicationId}
      stress={d.stress}
    />
  );
}

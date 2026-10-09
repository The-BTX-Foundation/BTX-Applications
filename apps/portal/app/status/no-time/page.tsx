// None of these times work. `?demo=no-time` (and `-stress`) draws the drafts' state in mock mode.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ApplyLoadError } from '@/components/load-error-pages';
import { NoTimeView } from '@/components/no-time-view';
import { loadJourney } from '@/lib/journey-data';
import { journeyLinks } from '@/lib/journey-demo';

export const metadata: Metadata = { title: 'Tell us when you’re free' };

export default async function NoTimePage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadJourney('/status/no-time', demo, 'no-time');
  if ('failed' in d) return <ApplyLoadError status />;
  // she already holds a time (the database refuses free times then): changing it is the other page
  if (!d.mock && d.booking) redirect('/status/change');
  const sample = d.mock && d.demoName?.startsWith('no-time');
  return (
    <NoTimeView
      accountName={d.fullName}
      slots={sample && d.stress ? [] : d.slots}
      scheduleHref={journeyLinks(d.mock ? (d.demoName ?? '') : null).schedule}
      initialDays={sample ? (d.stress ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun'] : ['Sun']) : (d.freeTimes?.days ?? [])}
      initialWindows={sample ? (d.stress ? ['morning', 'evening'] : ['morning']) : (d.freeTimes?.windows ?? [])}
      initialNote={sample ? d.note : (d.freeTimes?.note ?? '')}
      applicationId={d.applicationId}
      stress={d.stress}
    />
  );
}

// None of these times work. `?demo=no-time` (and `-stress`) draws the drafts' state in mock mode.
import type { Metadata } from 'next';
import { ApplyLoadError } from '@/components/load-error-pages';
import { NoTimeView } from '@/components/no-time-view';
import { loadJourney } from '@/lib/journey-data';
import { journeyLinks } from '@/lib/journey-demo';

export const metadata: Metadata = { title: 'Tell us when you’re free' };

export default async function NoTimePage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadJourney('/status/no-time', demo, 'no-time');
  if ('failed' in d) return <ApplyLoadError status />;
  const sample = d.mock && d.demoName?.startsWith('no-time');
  return (
    <NoTimeView
      accountName={d.fullName}
      slots={sample && d.stress ? [] : d.slots}
      scheduleHref={journeyLinks(d.mock ? (d.demoName ?? '') : null).schedule}
      initialDays={sample ? (d.stress ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun'] : ['Sun']) : []}
      initialWindows={sample ? (d.stress ? ['morning', 'evening'] : ['morning']) : []}
      initialNote={d.note}
      stress={d.stress}
    />
  );
}

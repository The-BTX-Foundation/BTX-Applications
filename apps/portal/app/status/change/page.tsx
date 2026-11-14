// Change your time. `?demo=change` (and `-stress`) draws the drafts' state in mock mode. Live: she must hold a time,
// otherwise she goes to the booking page (or, past the cycle's booking deadline, to /status, which shows the closed
// screen). `?taken=<time>` shows the "was just taken" notice.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChangeView } from '@/components/change-view';
import { ApplyLoadError } from '@/components/load-error-pages';
import { journeyLinks } from '@/lib/journey-demo';
import { bookingClosed, clock, dayLabel } from '@/lib/journey';
import { loadJourney } from '@/lib/journey-data';

export const metadata: Metadata = { title: 'Change your time' };

export default async function ChangePage({ searchParams }: { searchParams: Promise<{ demo?: string; taken?: string }> }) {
  const { demo, taken } = await searchParams;
  const d = await loadJourney('/status/change', demo, 'change');
  if ('failed' in d) return <ApplyLoadError status />;
  // no time to change: book one, unless booking has closed (live only; the demos set no deadline)
  if (!d.booking) redirect(!d.mock && !d.freeTimes && bookingClosed(d.now, d.view.bookingClosesAt) ? '/status' : '/status/schedule');
  const links = journeyLinks(d.mock ? (d.demoName ?? '') : null);
  const takenAt = taken && !Number.isNaN(Date.parse(taken)) ? taken : null;
  return (
    <ChangeView
      accountName={d.fullName}
      booking={d.booking}
      slots={d.slots}
      preselect={d.preselect}
      takenLabel={takenAt ? `${dayLabel(takenAt)} at ${clock(takenAt)}` : null}
      statusHref={d.mock ? `/status?demo=soon${d.stress ? '-stress' : ''}` : '/status'}
      noTimeHref={links.noTime}
      stress={d.stress}
      initialNote={d.note}
    />
  );
}

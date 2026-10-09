// The status page after submitting. It picks its screen from the real data (see lib/journey.ts): waiting for the
// interviews, book your interview, free times sent, booked, switched, interview soon, interview day, interview done,
// and the decision. `?demo=` draws each screen with the drafts' sample data in mock mode (never against the database):
// before-booking, sent, booked, switched, soon, today, after, won, won-sent, not-picked, and `-stress` on any of them
// (a bare `stress` is the waiting screen's stress demo).
import type { Metadata } from 'next';
import { ApplyLoadError } from '@/components/load-error-pages';
import { NotPickedStatus, WonStatus } from '@/components/decision-status';
import { JourneyStatus } from '@/components/journey-status';
import { StatusView } from '@/components/status-view';
import { journeyLinks } from '@/lib/journey-demo';
import { pickState } from '@/lib/journey';
import { loadJourney } from '@/lib/journey-data';
import { easternDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Application submitted' };

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ demo?: string; at?: string; days?: string; windows?: string }> }) {
  const { demo, at, days, windows } = await searchParams;
  const d = await loadJourney('/status', demo, 'waiting', at);
  // mock: the free times she just sent on the none-of-these-times page
  if ('mock' in d && d.mock && d.freeTimes && days && windows) d.freeTimes = { days: days.split(','), windows: windows.split(','), note: '' };
  if ('failed' in d) return <ApplyLoadError status />;
  const state = pickState({
    now: d.now,
    interviewStart: d.view.drawing?.interviewStart ?? null,
    interviewEnd: d.view.drawing?.interviewEnd ?? null,
    decisionDate: d.view.drawing?.decision ?? null,
    booking: d.booking,
    freeTimes: d.freeTimes,
    decision: d.decision,
  });
  if (state === 'waiting') {
    return (
      <StatusView
        view={d.view}
        accountName={d.fullName}
        email={d.email}
        code={d.code}
        submittedAt={d.submittedAt}
        today={easternDate(d.now)}
      />
    );
  }
  if ((state === 'won' || state === 'won-sent' || state === 'not-picked') && d.award) {
    const common = { accountName: d.fullName, firstName: d.firstName, fullName: d.fullName, view: d.view, award: d.award };
    const links = journeyLinks(d.mock ? (d.demoName ?? '') : null);
    return state === 'not-picked' ? <NotPickedStatus {...common} /> : <WonStatus {...common} sent={state === 'won-sent'} storyHref={links.story} />;
  }
  if (state === 'won' || state === 'won-sent' || state === 'not-picked') return null;
  return (
    <JourneyStatus
      state={state}
      accountName={d.fullName}
      firstName={d.firstName}
      submittedAt={d.submittedAt}
      now={d.now}
      view={d.view}
      booking={d.booking}
      freeTimes={d.freeTimes}
      interviewers={d.interviewers}
      links={journeyLinks(d.mock ? (d.demoName ?? '') : null)}
      mock={d.mock}
    />
  );
}

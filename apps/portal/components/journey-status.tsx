// The status screens after she submits and before the decision (drafts status-book, status-sent, status-booked,
// status-request, status, status-today and their phone versions): book your interview, free times sent, just booked,
// switched to a new time, interview soon, interview day, and the interview-done screen.
import Link from 'next/link';
import { HELP_EMAIL, Icon, TopBar } from '@btx/ui';
import { INTERVIEW_JOIN_URL } from '@/lib/config';
import { easternDate, longDay } from '@/lib/format';
import { buildIcs, icsHref } from '@/lib/ics';
import { clock, countdown, dayLabel, describeFreeTimes, range, soonTitle, type Booking, type FreeTimes, type JourneyState } from '@/lib/journey';
import type { CycleView } from '@/lib/cycle';
import { FollowCard } from './follow-card';
import { JourneyDrawing } from './journey-drawing';
import { PrintLink } from './print-link';
import { Name } from './text';
import s from './status-view.module.css';
import j from './journey-status.module.css';

export type JourneyLinks = { schedule: string; noTime: string; change: string };

export type JourneyStatusProps = {
  state: Extract<JourneyState, 'book' | 'sent' | 'booked' | 'switched' | 'soon' | 'today' | 'after'>;
  accountName: string;
  firstName: string;
  submittedAt: string;
  now: Date;
  view: CycleView;
  booking: Booking | null;
  freeTimes: FreeTimes | null;
  /** Board members who interview her (names only; none known in live mode yet). */
  interviewers: string[];
  links: JourneyLinks;
  /** Mock mode: show the join button even without an address. */
  mock?: boolean;
};

const nb = (t: string) => t.replace(/ /g, ' ');

// "Alice", "Alice and Bob", "A, B and C".
function names(list: string[]): string {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className={j.meta}>{children}</p>;
}

export function JourneyStatus(p: JourneyStatusProps) {
  const { state, view, booking, now } = p;
  const d = view.drawing;
  const applied = easternDate(p.submittedAt);
  const today = easternDate(now);
  const first = <Name>{p.firstName}</Name>;
  const decision = d ? d.decision : '';
  const drawing = d ? (
    <JourneyDrawing
      applied={applied}
      today={today}
      decision={decision}
      window={booking ? undefined : { start: d.interviewStart > today ? d.interviewStart : today, end: d.interviewEnd }}
      at={booking ? easternDate(booking.startsAt) : undefined}
    />
  ) : null;

  let title: React.ReactNode;
  let lead: React.ReactNode = null;
  if (state === 'book') {
    title = <>Your turn, {first}.</>;
    lead = `Pick a time by ${longDay(d?.interviewEnd)}.`;
  } else if (state === 'sent') {
    title = <>Finding you a time, {first}.</>;
    lead = "We'll email you when it's set.";
  } else if (state === 'booked') {
    title = <>You&apos;re booked, {first}.</>;
    lead = 'We emailed you the details.';
  } else if (state === 'switched') {
    title = <>Switched to {nb(booking ? dayLabel(booking.startsAt) : '')}, {first}.</>;
    lead = 'We emailed you the new details.';
  } else if (state === 'soon') {
    title = <>{booking ? soonTitle(now, booking.startsAt) : ''}, {first}.</>;
  } else if (state === 'today') {
    title = <>Good luck today, {first}.</>;
  } else {
    title = <>Interview done, {first}.</>;
    lead = `Decision by ${longDay(decision || null)}, by email. You hear back either way.`;
  }

  const ics =
    booking &&
    icsHref(
      buildIcs({
        uid: booking.slotId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        title: 'BTX Foundation scholarship interview',
        description: 'Video call, 30 minutes. Questions? Write to ' + HELP_EMAIL,
        now,
      }),
    );
  const calendar = (kind: 'p' | 's') =>
    ics ? (
      <a href={ics} download="btx-interview.ics" className={`btn ${kind}`}>
        <Icon name="calendar" />
        Add to calendar
      </a>
    ) : null;
  const change = (
    <Link href={p.links.change} className={`lk ${j.change}`}>
      Change your time
    </Link>
  );

  const card =
    state === 'sent' && p.freeTimes ? (
      <section className={j.tb}>
        <p className={s.label}>When you&apos;re free</p>
        <p className={j.tbt}>{describeFreeTimes(p.freeTimes)}</p>
        <Link href={p.links.noTime} className={`lk ${j.change}`}>
          Change your times
        </Link>
      </section>
    ) : booking && (state === 'booked' || state === 'switched' || state === 'soon' || state === 'today') ? (
      <section className={j.tk}>
        <span className={j.tkBar} aria-hidden="true" />
        <div className={j.tkHd}>
          <p className={s.label}>Your interview</p>
          {state !== 'soon' ? <span className={j.tkC}>{countdown(now, booking.startsAt)}</span> : null}
        </div>
        <p className={j.tkD}>{dayLabel(booking.startsAt)}</p>
        <Meta>
          <span>
            <Icon name="clock" />
            {range(booking.startsAt, booking.endsAt)} Eastern
          </span>
          <span>
            <Icon name="video" />
            Video call
          </span>
        </Meta>
        {p.interviewers.length ? (
          <p className={j.tkW}>
            <Icon name="people" />
            <span>With {names(p.interviewers)}, BTX board members.</span>
          </p>
        ) : null}
        <div className={j.tkA}>
          {state === 'soon' ? (
            <>
              <a href="#" className="btn p">
                <Icon name="file" />
                Read how to prepare
              </a>
              {calendar('s')}
            </>
          ) : state === 'today' ? (
            INTERVIEW_JOIN_URL || p.mock ? (
              <a href={INTERVIEW_JOIN_URL || '#'} className="btn p">
                <Icon name="video" />
                Join the video call
              </a>
            ) : null
          ) : (
            calendar('p')
          )}
          {change}
        </div>
      </section>
    ) : null;

  const book = state === 'book' ? (
    <>
      <Meta>
        <span>
          <Icon name="clock" />
          30 minutes
        </span>
        <span>
          <Icon name="video" />
          Video call
        </span>
      </Meta>
      <Link href={p.links.schedule} className={`btn p ${j.nb}`}>
        <Icon name="calendar" />
        Book your interview
      </Link>
    </>
  ) : null;

  const prep = (
    <div className={j.prep}>
      <p className={s.label}>Before your interview</p>
      <div className={s.pick}>
        <a href="#" className={s.pickRow}>
          <Icon name="file" />
          <span className="lk">How to prepare for your interview</span>
        </a>
      </div>
    </div>
  );
  const foot = (
    <div className={`${s.foot} ${j.ft}`}>
      <PrintLink className={s.footLink} />
      <span className={s.questions}>
        Questions?{' '}
        <a href={`mailto:${HELP_EMAIL}`} className="lk">
          {HELP_EMAIL}
        </a>
      </span>
    </div>
  );
  const showPrep = state === 'book' || state === 'sent' || state === 'booked' || state === 'switched';
  const showFollow = state !== 'today';

  return (
    <div className="app">
      <TopBar variant="signed-in" accountName={p.accountName} />
      <main id="main" className={`pm ${s.page}`}>
        <div className={s.wrap}>
          <h1 className={s.title}>{title}</h1>
          {lead ? <p className={s.lead}>{lead}</p> : null}
          {book}
          {state === 'book' ? (
            <>
              <div className={j.wide}>{drawing}</div>
              <div className={`${j.cols} ${j.colsBook}`}>
                <div className={j.c1}>
                  {prep}
                  {foot}
                </div>
                <div className={j.c2}>
                  <FollowCard className={j.follow} />
                </div>
              </div>
            </>
          ) : (
            <div className={j.cols}>
              <div className={j.c1}>
                <div className={j.hero}>{card}</div>
                {showPrep ? prep : null}
                {foot}
              </div>
              <div className={j.c2}>
                <div className={j.side}>{drawing}</div>
                {showFollow ? <FollowCard className={j.follow} /> : null}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Server-side loading for the screens after she submits: the status page and the booking pages. Mock mode builds the
// sample from lib/journey-demo.ts; live mode reads her submitted application, the cycle and the journey functions
// through her own session (row-level security applies). Written exactly against the journey migration
// (supabase/migrations/20261010130000_portal_journey.sql on db/ops-schema; drafted, not applied):
//   open times       rpc open_interview_slots (applicants no longer read every slot)
//   her interview    rpc my_interview (time, interviewers, video link); bookings give when she booked and whether
//                    she switched
//   her decision     rpc my_decision (null until an admin releases the decisions)
//   free times       table interview_free_times
//   photo and story  table award_stories and the private bucket award-photos
// NOT TESTED AGAINST LIVE DATA. Things the draft does not give: the payment date (shown as [date]) and whether she
// is on the next-cycle reminder (the row is left out).
import { redirect } from 'next/navigation';
import {
  fetchFreeTimes,
  fetchMyDecision,
  fetchMyInterview,
  fetchOpenSlots,
  fetchPublishedCycle,
  fetchStory,
  getAuthMode,
  photoUrl,
  type Application,
  type StoryRow,
} from '@btx/data';
import { toView, type CycleView } from './cycle';
import { formatMoney, longDay, easternDate } from './format';
import { buildDemo, type AwardSample, type Demo, type DemoName } from './journey-demo';
import type { Booking, Decision, FreeTimes, Slot } from './journey';
import { sessionClient } from './supabase-server';

export type JourneyData = {
  mock: boolean;
  fullName: string;
  firstName: string;
  email: string;
  code?: string;
  submittedAt: string;
  now: Date;
  view: CycleView;
  booking: Booking | null;
  freeTimes: FreeTimes | null;
  decision: Decision;
  interviewers: string[];
  /** The video-call link, or null. */
  joinUrl: string | null;
  slots: Slot[];
  preselect: string | null;
  note: string;
  award: AwardSample | null;
  stress: boolean;
  demoName: string | null;
  /** Live only: ids for the booking, free-times and story calls. */
  applicationId: string | null;
  userId: string | null;
  awardId: string | null;
  /** Live only: her saved photo and story row (the story page starts from it). */
  story: StoryRow | null;
};

const fromDemo = (d: Demo, raw: string | undefined): JourneyData => ({
  mock: true,
  fullName: d.fullName,
  firstName: d.firstName,
  email: d.email,
  submittedAt: d.submittedAt,
  now: d.now,
  view: d.view,
  booking: d.booking,
  freeTimes: d.freeTimes,
  decision: d.decision,
  interviewers: d.interviewers,
  joinUrl: '#',
  slots: d.slots,
  preselect: d.preselect,
  note: d.note,
  award: d.award,
  stress: d.stress,
  demoName: raw ?? null,
  applicationId: null,
  userId: null,
  awardId: null,
  story: null,
});

const slug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Loads the data for `here` (the return address after sign-in). `fallback` is the demo shown in mock mode without ?demo=. */
export async function loadJourney(here: string, raw: string | undefined, fallback: DemoName | 'waiting', at?: string): Promise<JourneyData | { failed: true }> {
  if (getAuthMode() === 'mock') {
    if (raw === 'error') return { failed: true };
    return fromDemo(buildDemo(raw, fallback, at), raw);
  }
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const { cycle, failed } = await fetchPublishedCycle(client);
  if (failed) return { failed: true };
  const { data: application, error } = cycle
    ? await client.from('applications').select('*').eq('cycle_id', cycle.id).maybeSingle()
    : { data: null, error: null };
  if (error) return { failed: true };
  if (!cycle || !application || application.status !== 'submitted') redirect('/apply/start');
  const app: Application = application;

  const [slotsRes, interviewRes, bookingsRes, decisionRes, freeRes] = await Promise.all([
    fetchOpenSlots(client, cycle.id),
    fetchMyInterview(client, cycle.id),
    client.from('bookings').select('*').eq('application_id', app.id),
    fetchMyDecision(client, cycle.id),
    fetchFreeTimes(client, app.id),
  ]);
  if (!slotsRes || interviewRes.failed || bookingsRes.error || decisionRes.failed || freeRes.failed) return { failed: true };

  const all = bookingsRes.data ?? [];
  const active = all.find((b) => b.status === 'active') ?? null;
  const iv = interviewRes.interview;
  const booking: Booking | null =
    iv && active
      ? { slotId: iv.slotId, startsAt: iv.startsAt, endsAt: iv.endsAt, bookedAt: active.created_at, switched: all.some((b) => b.status === 'released') }
      : null;

  // her decision, and for a winner her award details and her saved photo and story
  const dec = decisionRes.decision;
  let view = toView(cycle);
  let decision: Decision = null;
  let award: AwardSample | null = null;
  let awardId: string | null = null;
  let story: StoryRow | null = null;
  if (dec) {
    if (dec.kind === 'not-picked') {
      decision = { kind: 'not-picked' };
    } else {
      decision = { kind: 'won', storySent: dec.storySent };
      awardId = dec.awardId;
      if (dec.amountCents) view = { ...view, amount: formatMoney(dec.amountCents) };
      const s = await fetchStory(client, dec.awardId);
      if (s.failed) return { failed: true };
      story = s.row;
    }
    const photo = story?.photoPath ? await photoUrl(client, story.photoPath) : null;
    award = {
      slug: slug(app.full_name ?? ''),
      yearMajor: [app.year_in_school, app.major].filter(Boolean).join(', '),
      school: 'University of Maryland, Clark School',
      story: story?.story ?? '',
      photo,
      payDate: '[date]',
      sentDate: story?.sentAt ? longDay(easternDate(story.sentAt)) : '',
      certification: app.interest_certification,
      mentoring: app.interest_mentoring,
      reminder: false,
      news: app.stay_in_touch,
    };
  }

  return {
    mock: false,
    fullName: app.full_name || 'Your account',
    firstName: (app.full_name ?? '').trim().split(/\s+/)[0] || 'there',
    email: app.terpmail,
    code: app.applicant_code ?? undefined,
    submittedAt: app.submitted_at ?? app.updated_at,
    now: new Date(),
    view,
    booking,
    freeTimes: freeRes.row,
    decision,
    interviewers: iv?.interviewers ?? [],
    joinUrl: iv?.videoUrl ?? null,
    slots: slotsRes,
    preselect: null,
    note: '',
    award,
    stress: false,
    demoName: null,
    applicationId: app.id,
    userId: auth.user.id,
    awardId,
    story,
  };
}

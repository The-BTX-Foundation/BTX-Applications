// Server-side loading for the screens after she submits: the status page and the booking pages. Mock mode builds the
// sample from lib/journey-demo.ts; live mode reads her submitted application, the cycle, the interview slots and her
// bookings through her own session (row-level security applies).
//
// NOT TESTED AGAINST LIVE DATA. What the live schema (20261009130000_portal_fresh_start.sql) cannot give yet:
//  - which slots are already taken: a student can read every interview_slots row but only her OWN bookings, so the
//    list shows all future slots and switch_booking answers 'taken' for a time somebody else holds;
//  - the board members who interview her, the "None of these times work" answers, the decision, and the photo and
//    story: no table or column holds them (the Ops Hub draft supabase/migrations/20261010120000_ops_hub.sql has
//    awards and pairings but is not applied). In live mode those come back empty, so the screens never announce a
//    decision that was not recorded.
import { redirect } from 'next/navigation';
import { fetchPublishedCycle, getAuthMode, type Application } from '@btx/data';
import { toView, type CycleView } from './cycle';
import { buildDemo, type Demo, type DemoName } from './journey-demo';
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
  slots: Slot[];
  stress: boolean;
  demoName: string | null;
  /** The application id, for the booking calls (live only). */
  applicationId: string | null;
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
  slots: d.slots,
  stress: d.stress,
  demoName: raw ?? null,
  applicationId: null,
});

/** Loads the data for `here` (the return address after sign-in). `fallback` is the demo shown in mock mode without ?demo=. */
export async function loadJourney(here: string, raw: string | undefined, fallback: DemoName | 'waiting'): Promise<JourneyData | { failed: true }> {
  if (getAuthMode() === 'mock') {
    if (raw === 'error') return { failed: true };
    return fromDemo(buildDemo(raw, fallback), raw);
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

  const [slotsRes, bookingsRes] = await Promise.all([
    client.from('interview_slots').select('*').eq('cycle_id', cycle.id).order('starts_at'),
    client.from('bookings').select('*').eq('application_id', app.id),
  ]);
  if (slotsRes.error || bookingsRes.error) return { failed: true };
  const rows = slotsRes.data ?? [];
  const all = bookingsRes.data ?? [];
  const active = all.find((b) => b.status === 'active') ?? null;
  const slot = active ? rows.find((r) => r.id === active.slot_id) : null;
  const booking: Booking | null =
    active && slot
      ? {
          slotId: slot.id,
          startsAt: slot.starts_at,
          endsAt: slot.ends_at,
          bookedAt: active.created_at,
          switched: all.some((b) => b.status === 'released'),
        }
      : null;
  const now = new Date();
  return {
    mock: false,
    fullName: app.full_name || 'Your account',
    firstName: (app.full_name ?? '').trim().split(/\s+/)[0] || 'there',
    email: app.terpmail,
    code: app.applicant_code ?? undefined,
    submittedAt: app.submitted_at ?? app.updated_at,
    now,
    view: toView(cycle),
    booking,
    freeTimes: null,
    decision: null,
    interviewers: [],
    slots: rows.filter((r) => new Date(r.starts_at) > now && r.id !== booking?.slotId).map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at })),
    stress: false,
    demoName: null,
    applicationId: app.id,
  };
}

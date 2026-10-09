// Sample data for the screens after she submits, in mock mode only (`?demo=` on /status and the booking pages). The
// values are the signed-off Figma frames' samples (Ebony Coleman, Fall 2026, interviews Sep 15 to Oct 9, decision
// Fri Oct 23). Live mode never reads this file's data: it computes from the real cycle, bookings and decision.
import { MOCK_VIEW, type CycleView } from './cycle';
import { STRESS } from './stress';
import type { Booking, Decision, FreeTimes, Slot } from './journey';

export type DemoName =
  | 'before-booking'
  | 'booked'
  | 'switched'
  | 'soon'
  | 'today'
  | 'sent'
  | 'after'
  | 'won'
  | 'won-sent'
  | 'not-picked'
  | 'schedule'
  | 'taken'
  | 'no-time'
  | 'change'
  | 'story';

export const DEMO_NAMES: readonly DemoName[] = [
  'before-booking', 'booked', 'switched', 'soon', 'today', 'sent', 'after', 'won', 'won-sent', 'not-picked',
  'schedule', 'taken', 'no-time', 'change', 'story',
];

/** "?demo=booked-stress" -> { name: 'booked', stress: true }; a bare "stress" is the waiting screen's stress demo. */
export function parseDemo(raw?: string): { name: DemoName | 'waiting' | null; stress: boolean } {
  if (!raw) return { name: null, stress: false };
  const stress = raw === 'stress' || raw.endsWith('-stress');
  const base = raw === 'stress' ? 'waiting' : raw.replace(/-stress$/, '');
  if (base === 'waiting') return { name: 'waiting', stress };
  if ((DEMO_NAMES as readonly string[]).includes(base)) return { name: base as DemoName, stress };
  return { name: null, stress: false };
}

// Eastern clock time on a date (EDT, UTC-4, which holds through Oct 31, 2026) as an ISO string.
export function et(date: string, h: number, m = 0): string {
  return new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`).toISOString();
}
const slot = (date: string, h: number, m = 0): Slot => ({ id: `demo-${date}-${h}-${m}`, startsAt: et(date, h, m), endsAt: et(date, h, m + 30) });

// The open times in the schedule frames (hour 24h).
const OPEN: Record<string, number[]> = {
  '2026-09-16': [12, 18], '2026-09-17': [19], '2026-09-18': [12], '2026-09-19': [10, 11], '2026-09-20': [14], '2026-09-21': [18],
  '2026-09-22': [19], '2026-09-23': [12, 18], '2026-09-24': [18], '2026-09-26': [10, 11], '2026-09-28': [18], '2026-09-29': [19],
  '2026-09-30': [12], '2026-10-01': [18], '2026-10-03': [10, 12], '2026-10-05': [10, 18], '2026-10-06': [18, 19], '2026-10-07': [12],
  '2026-10-08': [19], '2026-10-09': [12],
};
export function demoSlots(stress: boolean): Slot[] {
  const list = Object.entries(OPEN).flatMap(([d, hs]) => hs.map((h) => slot(d, h)));
  if (!stress) return list;
  // the stress frames: a busy Sep 30 (11 open times, 8:00 AM to 9:30 PM) and a 9:30 PM time on Sep 30 that she picks
  const busy = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].slice(0, 10).map((h) => slot('2026-09-30', h)).concat([slot('2026-09-30', 21, 30)]);
  return [...list.filter((s) => !s.id.includes('2026-09-30')), ...busy];
}
// The change-your-time frames: the week of Oct 5, her current time Tue Oct 6 6:00 PM.
export function demoChangeSlots(stress: boolean): Slot[] {
  if (stress) {
    return [slot('2026-09-28', 8), slot('2026-09-29', 19), slot('2026-09-29', 21, 30), slot('2026-09-30', 8), slot('2026-10-01', 18), slot('2026-10-02', 12), slot('2026-10-02', 13)];
  }
  return [slot('2026-10-05', 18), slot('2026-10-06', 19), slot('2026-10-07', 18), slot('2026-10-08', 18), slot('2026-10-09', 12), slot('2026-10-09', 13)];
}

export type Demo = {
  name: DemoName | 'waiting';
  stress: boolean;
  fullName: string;
  firstName: string;
  email: string;
  submittedAt: string;
  now: Date;
  view: CycleView;
  booking: Booking | null;
  freeTimes: FreeTimes | null;
  decision: Decision;
  interviewers: string[];
  slots: Slot[];
};

const EBONY = { fullName: 'Ebony Coleman', firstName: 'Ebony', email: 'ecoleman@terpmail.umd.edu' };
const SUBMITTED = '2026-09-12T20:52:00Z';

export function buildDemo(raw: string | undefined, fallback: DemoName | 'waiting' = 'waiting'): Demo {
  const { name: parsed, stress } = parseDemo(raw);
  const name = parsed ?? fallback;
  const who = stress
    ? { fullName: STRESS.name, firstName: STRESS.firstName, email: STRESS.email }
    : EBONY;
  // the interview: Tue Oct 6, 6:00 PM (stress: 9:30 PM)
  const hm: [number, number] = stress ? [21, 30] : [18, 0];
  const interview = (date: string, bookedAt: string, switched = false): Booking => ({
    slotId: `demo-${date}`,
    startsAt: et(date, hm[0], hm[1]),
    endsAt: et(date, hm[0], hm[1] + 30),
    bookedAt,
    switched,
  });
  const nowOf: Record<string, string> = {
    waiting: '2026-09-13T16:00:00Z',
    'before-booking': '2026-09-15T16:00:00Z',
    schedule: '2026-09-15T16:00:00Z',
    taken: '2026-09-15T16:00:00Z',
    'no-time': '2026-09-15T16:00:00Z',
    booked: '2026-09-15T16:00:00Z',
    sent: '2026-09-15T16:00:00Z',
    switched: '2026-10-04T18:00:00Z',
    change: '2026-10-04T18:00:00Z',
    soon: '2026-10-04T18:00:00Z',
    today: et('2026-10-06', 17, 52),
    after: '2026-10-07T16:00:00Z',
    won: '2026-10-23T14:00:00Z',
    'won-sent': '2026-10-23T14:00:00Z',
    story: '2026-10-23T14:00:00Z',
    'not-picked': '2026-10-23T14:00:00Z',
  };
  const now = new Date(nowOf[name]);
  const before = (ms: number) => new Date(now.getTime() - ms).toISOString();
  let booking: Booking | null = null;
  if (name === 'booked') booking = interview('2026-10-06', before(60000));
  if (name === 'switched') booking = interview('2026-10-07', before(60000), true);
  if (name === 'soon' || name === 'after') booking = interview('2026-10-06', '2026-09-15T16:00:00Z');
  if (name === 'today') booking = interview('2026-10-06', '2026-09-15T16:00:00Z');
  if (name === 'change') booking = interview('2026-10-06', '2026-09-15T16:00:00Z');
  if (name === 'won' || name === 'won-sent' || name === 'not-picked' || name === 'story') booking = interview('2026-10-06', '2026-09-15T16:00:00Z');
  const freeTimes: FreeTimes | null =
    name === 'sent'
      ? stress
        ? { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], windows: ['morning', 'afternoon', 'evening'], note: '' }
        : { days: ['Sun'], windows: ['morning'], note: '' }
      : null;
  const decision: Decision =
    name === 'won' || name === 'story' ? { kind: 'won', storySent: false } : name === 'won-sent' ? { kind: 'won', storySent: true } : name === 'not-picked' ? { kind: 'not-picked' } : null;
  return {
    name,
    stress,
    ...who,
    submittedAt: SUBMITTED,
    now,
    view: MOCK_VIEW,
    booking,
    freeTimes,
    decision,
    interviewers: ['Cillisha Knights', 'Darien Strachan'],
    slots: name === 'change' ? demoChangeSlots(stress) : demoSlots(stress),
  };
}

/** Where the journey links go in mock mode: they carry the demo name so a click stays inside the same preview. */
export function journeyLinks(demo?: string | null) {
  const stress = demo ? parseDemo(demo).stress : false;
  const q = (n: string) => (demo !== undefined && demo !== null ? `?demo=${n}${stress ? '-stress' : ''}` : '');
  return {
    status: (n: string) => `/status${demo !== undefined && demo !== null ? q(n) : ''}`,
    schedule: `/status/schedule${q('schedule')}`,
    noTime: `/status/no-time${q('no-time')}`,
    change: `/status/change${q('change')}`,
    story: `/status/story${q('story')}`,
  };
}

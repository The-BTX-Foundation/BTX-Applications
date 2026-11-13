// MOCK: the Awardees page's sample data, in the demo's shape (apps/design/ops-refresh/directions/p-awardees: awards(),
// PAST and CYCLE). lib/awardees-view-loader.ts returns these when there is no Supabase env. Two moments, as the demo:
// before the award (Tue Nov 10, the sample day: the selection meeting is still ahead) and after it (Thu Dec 3: two
// awardees working through their five steps). The names and emails are made up.
import type { AwAward, AwardeesView, AwCaps, AwCycle, AwPast } from '@/lib/awardees-view';

/** Mock mode draws every demo behaviour (the email reminder included: nothing is sent, the page only draws it). */
export const AW_MOCK_CAPS: AwCaps = { tick: true, undo: true, funds: true, remindEmail: true, recordReminder: false };

/** Fall 2026: chosen at the selection meeting (7:00 PM), students hear Mon Nov 30. */
const CYCLE: AwCycle = { term: 'Fall 2026', mainAward: 'Legacy', mainCents: 250000, meeting: '7:00 PM', decisionDay: '2026-11-30', releasedAt: null };

// Noon Eastern on a day in late 2026 (standard time).
const noon = (day: string) => `${day}T12:00:00-05:00`;

/** The two awardees of the "after the award" moment (stress: the longest real name and a second code). */
function awards(stress: boolean): AwAward[] {
  return [
    {
      id: 'jt',
      code: stress ? 'APP-2026-00010' : 'APP-2026-00003',
      name: stress ? 'Adaeze-Grace Nwachukwu-Bello' : 'Jalen Thomas',
      email: stress ? 'adaeze.nwachukwu-bello@example.org' : 'jalen.thomas@example.org',
      award: 'Legacy',
      amountCents: 250000,
      kind: 'main',
      note: null,
      done: [noon('2026-11-30'), noon('2026-12-01'), null, null, null],
      reminder: null,
      fundsDue: '2026-12-14',
      comment: null,
    },
    {
      id: 'rs',
      code: 'APP-2026-00014',
      name: 'Renee Simmons',
      email: 'renee.simmons@example.org',
      award: 'Empowerment',
      amountCents: 50000,
      kind: 'extra',
      note: 'Opened at the selection meeting',
      done: [noon('2026-11-30'), null, null, null, null],
      reminder: noon('2026-12-02'),
      fundsDue: '2026-12-14',
      comment: { by: 'Keith Dawson', initials: 'KD', text: 'Glad we opened the Empowerment award for Renee.' },
    },
  ];
}

/** Past awards entered by hand for history (initials only, as entered): 14 in two terms. */
const PAST: AwPast[] = [
  ...['G.A.', 'M.N.', 'T.B.', 'S.L.', 'C.R.', 'B.H.', 'F.W.'].map((label, i) => ({ id: `p25-${i}`, term: 'Spring 2025', award: i === 0 ? 'Legacy' : 'Think Big', amountCents: i === 0 ? 200000 : 100000, label, main: i === 0 })),
  ...['H.D.', 'P.W.', 'K.O.', 'E.F.', 'Z.M.', 'L.V.', 'R.J.'].map((label, i) => ({ id: `p24-${i}`, term: 'Spring 2024', award: i === 0 ? 'Legacy' : 'Think Big', amountCents: i === 0 ? 150000 : 75000, label, main: i === 0 })),
];

/** Before the award (the sample day, Tue Nov 10): no awards yet, the past terms below. */
export const AW_VIEW_BEFORE: AwardeesView = {
  failed: false,
  today: '2026-11-10',
  cycle: CYCLE,
  awards: [],
  past: PAST,
  pastFailed: false,
  loadFailed: false,
  caps: AW_MOCK_CAPS,
};

/** After the award (Thu Dec 3): decisions out Mon Nov 30, two awardees. */
export const AW_VIEW_AFTER: AwardeesView = {
  ...AW_VIEW_BEFORE,
  today: '2026-12-03',
  cycle: { ...CYCLE, releasedAt: noon('2026-11-30') },
  awards: awards(false),
};

/** Stress: after the award, with the longest real name. */
export const AW_VIEW_STRESS: AwardeesView = { ...AW_VIEW_AFTER, awards: awards(true) };

/** Empty: no awards recorded and no past awards entered. */
export const AW_VIEW_EMPTY: AwardeesView = { ...AW_VIEW_BEFORE, past: [] };

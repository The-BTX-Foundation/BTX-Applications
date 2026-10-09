// MOCK: the awardees, their follow-up steps and past awards, shaped like the draft Ops Hub tables `scholarship_awards`
// (award_name, amount_cents, kind, decision_note, letter_sent_at, accepted_at, payment_due_on, paid_on, past_term,
// awardee_label) and `award_steps` (step 1 to 5, due_on, done_at, note, reminder_sent_at). None of these tables exist yet
// (draft on branch db/ops-schema). The sample is the Figma "Scholarships > Awardees, on Oct 26" frame (Fall 2026, two awards).
// The full names are made up (the real name comes from `applications.full_name`); only initials are shown elsewhere.
export type StepKind = 'letter_sent' | 'acceptance_back' | 'payment_details' | 'funds_sent' | 'thank_you_and_photo';

export type MockStep = { step: 1 | 2 | 3 | 4 | 5; kind: StepKind; due_on: string | null; done_at: string | null; note: string | null; reminder_sent_at: string | null };

export type MockAward = {
  id: string;
  code: string;
  initials: string;
  fullName: string;
  email: string;
  award_name: string;
  amount_cents: number | null;
  kind: 'main' | 'extra';
  decision_note: string | null;
  letter_sent_at: string | null;
  accepted_at: string | null;
  payment_due_on: string | null;
  paid_on: string | null;
  steps: MockStep[];
  comment: { by: string; byInitials: string; text: string } | null;
};

export type MockPast = { id: string; past_term: string; award_name: string; amount_cents: number; awardee_label: string };

/** Today on the Awardees frame (a Monday, Oct 26). */
export const AWARDEES_NOW = '2026-10-26T12:00:00-04:00';
export const AWARDEES_TERM = 'Fall 2026';
export const ANNOUNCED_ON = '2026-10-23';

const steps = (done: number[], reminder: Record<number, string> = {}, due: Record<number, string> = {}): MockStep[] => {
  const kinds: StepKind[] = ['letter_sent', 'acceptance_back', 'payment_details', 'funds_sent', 'thank_you_and_photo'];
  const dones: Record<number, string> = { 1: '2026-10-23T12:00:00-04:00', 2: '2026-10-24T12:00:00-04:00', 3: '2026-10-25T12:00:00-04:00' };
  return kinds.map((kind, i) => ({
    step: (i + 1) as MockStep['step'],
    kind,
    due_on: due[i + 1] ?? null,
    done_at: done.includes(i + 1) ? (dones[i + 1] ?? '2026-10-25T12:00:00-04:00') : null,
    note: null,
    reminder_sent_at: reminder[i + 1] ?? null,
  }));
};

export const AWARDS: MockAward[] = [
  {
    id: 'mock-award-jt',
    code: 'APP-2026-00003',
    initials: 'J.T.',
    fullName: 'Jordan Taylor',
    email: 'jordan.taylor@example.org',
    award_name: 'Legacy',
    amount_cents: 200000,
    kind: 'main',
    decision_note: 'Top score, no tie',
    letter_sent_at: '2026-10-23T12:00:00-04:00',
    accepted_at: '2026-10-24T12:00:00-04:00',
    payment_due_on: '2026-11-06',
    paid_on: null,
    steps: steps([1, 2], {}, { 4: '2026-11-06' }),
    comment: null,
  },
  {
    id: 'mock-award-rs',
    code: 'APP-2026-00014',
    initials: 'R.S.',
    fullName: 'Riley Santos',
    email: 'riley.santos@example.org',
    award_name: 'Empowerment',
    amount_cents: 50000,
    kind: 'extra',
    decision_note: 'Opened at the selection meeting',
    letter_sent_at: '2026-10-23T12:00:00-04:00',
    accepted_at: null,
    payment_due_on: null,
    paid_on: null,
    steps: steps([1], { 2: '2026-10-25T12:00:00-04:00' }, { 4: '2026-11-06' }),
    comment: { by: 'Kelsey Davis', byInitials: 'KD', text: 'R.S. was close to the top. Glad we opened the Empowerment award.' },
  },
];

/** Past awards entered by hand for history ("All past 14"): 14 in two terms. */
export const PAST: MockPast[] = [
  ...['G.A.', 'M.N.', 'T.B.', 'S.L.', 'C.R.', 'B.H.', 'F.W.'].map((l, i) => ({ id: `past-s25-${i}`, past_term: 'Spring 2025', award_name: i === 0 ? 'Legacy' : 'Think Big', amount_cents: i === 0 ? 200000 : 100000, awardee_label: l })),
  ...['H.D.', 'P.W.', 'K.O.', 'E.F.', 'Z.M.', 'L.V.', 'R.J.'].map((l, i) => ({ id: `past-s24-${i}`, past_term: 'Spring 2024', award_name: i === 0 ? 'Legacy' : 'Think Big', amount_cents: i === 0 ? 150000 : 75000, awardee_label: l })),
];

type Store = { done: Record<string, Record<number, string>>; reminders: Record<string, string> };
const g = globalThis as unknown as { __btxAwardees?: Store };

/** Steps ticked and reminders sent in this server process (mock mode only). */
export function awardeeStore(): Store {
  g.__btxAwardees ??= { done: {}, reminders: {} };
  return g.__btxAwardees;
}

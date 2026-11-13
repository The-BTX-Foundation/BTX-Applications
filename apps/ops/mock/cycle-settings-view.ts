// Cycle settings sample data for mock mode (no Supabase env): the demo's states (apps/design/ops-refresh/directions/
// p-cycle-settings), with "today" fixed at Tue Nov 10, 2026 like the demo. Times are Eastern, stored as the instants the
// database would hold (Oct 12 9:00 AM EDT = 13:00Z, Nov 6 11:59 PM EST = Nov 7 04:59Z).
import type { CycleRow } from '@/lib/cycle-settings';
import { capsFor, hasOpened } from '@/lib/cycle-settings-rows';
import type { CycleSettingsView } from '@/lib/cycle-settings-view';

export const CS_TODAY = '2026-11-10';
/** The demo's "now": 9:00 AM Eastern on CS_TODAY (EST, so 14:00Z). */
export const CS_NOW = '2026-11-10T14:00:00.000Z';

const REQS = ['High school senior or current college student', 'Plans to study science, technology, engineering or math'];

// Fall 2026, published and running (21 applications, 5 booked interview times).
const FALL: CycleRow = {
  id: 'mock-fall-2026',
  term: 'Fall 2026',
  status: 'published',
  award_name: 'Legacy Scholarship',
  award_amount_cents: 250_000,
  opens_at: '2026-10-12T13:00:00.000Z',
  closes_at: '2026-11-07T04:59:00.000Z',
  interview_start: '2026-11-10',
  interview_end: '2026-11-20',
  decision_date: '2026-11-30',
  next_cycle_month: null,
  requirements: REQS,
  photo_due: null,
  payment_note: null,
  event_enabled: false,
  event_at: null,
};

// The view around a cycle.
function view(cycle: CycleRow | null, applications: number, booked: number | null, admin: boolean, other: string | null = null): CycleSettingsView {
  const opened = !!cycle && hasOpened(cycle.opens_at, Date.parse(CS_NOW));
  return { failed: false, loadFailed: false, today: CS_TODAY, now: CS_NOW, cycle, applications, booked, otherPublishedTerm: other, canEdit: admin, caps: cycle ? capsFor(admin, cycle.status, applications, opened) : capsFor(false, '', 0, false) };
}

/** Normal: the published Fall 2026 cycle. */
export const CS_VIEW = view(FALL, 21, 5, true);

/** Stress: the longest name, $1,000,000, eight long requirements, the long payment note, the event on, 148 applicants. */
export const CS_VIEW_STRESS = view(
  {
    ...FALL,
    award_name: 'Legacy Scholarship for Future Scientists, Engineers and Mathematicians of the Greater Washington Region',
    award_amount_cents: 100_000_000,
    requirements: [
      ...REQS,
      'Lives in Washington, DC, Maryland or Virginia, or attends a school in one of the three',
      'Has a cumulative GPA of 3.0 or higher on the most recent official or unofficial transcript',
      'Can join a 30-minute video interview with two board members during the interview weeks',
      'Agrees to share a photo and a short story about their studies if they receive the award',
      'Is not a relative of a current BTX Foundation board member',
      'Has not received the Legacy Scholarship in an earlier cycle',
    ],
    payment_note:
      'Paid directly to the school’s financial aid office for tuition, fees or books, after the school confirms enrollment for the coming term. If the school cannot accept outside awards, the board decides another way to pay.',
    event_enabled: true,
    event_at: '2026-12-05T19:00:00.000Z',
    photo_due: '2026-12-11',
  },
  148,
  47,
  true,
);

/** Draft: a new Spring 2027 draft with only the award name and requirements, while Fall 2026 is published. */
export const CS_VIEW_DRAFT = view(
  {
    ...FALL,
    id: 'mock-spring-2027',
    term: 'Spring 2027',
    status: 'draft',
    award_amount_cents: null,
    opens_at: null,
    closes_at: null,
    interview_start: null,
    interview_end: null,
    decision_date: null,
  },
  0,
  0,
  true,
  'Fall 2026',
);

/** View only: a board member without admin rights. */
export const CS_VIEW_VIEWONLY = view(FALL, 21, 5, false);

/** Empty: no draft or published cycle. */
export const CS_VIEW_EMPTY = view(null, 0, null, true);

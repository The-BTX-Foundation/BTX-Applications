// MOCK: the refreshed Fundraising page's sample (the demo p-fundraising's makeData), on its sample day Tue Nov 10, 2026,
// in the shape of lib/fundraising-view.ts. Normal, stress and empty, as the demo's State menu draws them.
import type { FrChecklist, FrOwner, FrSource, FundraisingView } from '@/lib/fundraising-view';

const P = (id: string, name: string, initials: string): FrOwner => ({ kind: 'person', id, name, first: name.split(' ')[0], initials });
const DANA = P('dm', 'Dana Mercer', 'DM');
const KEITH = P('kd', 'Keith Dawson', 'KD');
const CAMILA = P('ck', 'Camila Keane', 'CK');
const DORIAN = P('ds', 'Dorian Sutton', 'DS');
const NONE: FrOwner = { kind: 'none' };

// The four sources with the demo's amounts (in cents).
const SRC = (individual: number, corporate: number, event: number): FrSource[] => [
  { key: 'individual', label: 'Individual donors', cents: individual },
  { key: 'corporate', label: 'Employer match and corporate', cents: corporate },
  { key: 'event', label: 'Events', cents: event },
  { key: 'grant', label: 'Grants', cents: 0 },
];

// The "Year-end giving" steps; stress swaps owners, dates and the longest real title in.
const STEPS = (stress: boolean): FrChecklist => ({
  title: 'Year-end giving',
  steps: [
    { id: 'y1', title: 'Set the year-end goal: $5,200', kind: 'Goal', owner: stress ? CAMILA : KEITH, due: stress ? '2026-09-30' : '2026-10-02', done: true },
    { id: 'y2', title: 'Draft the donor letter', kind: 'Letter', owner: stress ? DORIAN : KEITH, due: '2026-11-13', done: false },
    { id: 'y3', title: 'Add a donate link to the newsletter', kind: 'Newsletter', owner: DANA, due: '2026-11-13', done: false },
    {
      id: 'y4',
      title: stress ? 'Announce the Legacy Scholarship at the NSBE event and cocktail hour' : 'Giving Tuesday post on Instagram',
      kind: 'Outreach post',
      owner: DANA,
      due: stress ? '2026-12-31' : '2026-12-01',
      done: false,
    },
    { id: 'y5', title: 'Send thank-you notes', kind: 'Follow-up', owner: stress ? NONE : KEITH, due: '2026-12-18', done: false },
  ],
});

const BASE = {
  today: '2026-11-10',
  year: 2026,
  me: 'dm',
  goalCents: 1_500_000,
  recent: [],
  budgetCount: 1,
  loadFailed: false,
  caps: { logGift: true, giftUndo: true, tick: true, nudge: true },
} satisfies Partial<FundraisingView>;

/** The normal sample. */
export const FUNDRAISING_VIEW: FundraisingView = {
  ...BASE,
  raisedCents: 980_000,
  q3Cents: 420_000,
  donors: 27,
  newDonors: 8,
  monthlyDonors: 5,
  avgCents: 36_000,
  sources: SRC(630_000, 250_000, 100_000),
  checklist: STEPS(false),
};

/** The stress sample: 120 donors (99+), no new ones, no events. */
export const FUNDRAISING_VIEW_STRESS: FundraisingView = {
  ...FUNDRAISING_VIEW,
  donors: 120,
  newDonors: 0,
  sources: SRC(730_000, 250_000, 0),
  checklist: STEPS(true),
};

/** The empty sample: nothing given yet. */
export const FUNDRAISING_VIEW_EMPTY: FundraisingView = {
  ...FUNDRAISING_VIEW,
  raisedCents: 0,
  q3Cents: 0,
  donors: 0,
  newDonors: 0,
  monthlyDonors: 0,
  avgCents: 0,
  sources: SRC(0, 0, 0),
};

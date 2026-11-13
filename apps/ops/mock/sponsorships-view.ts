// MOCK: the Sponsorships page's sample data in the refreshed page's shape (lib/sponsorships-view.ts), copied from the demo
// (apps/design/ops-refresh/directions/p-sponsorships, which took it from mock/programs.ts MOCK_SPONSORSHIPS and its stress
// copy). The sample day is Tue Nov 10, 2026, as on every demo page. Mock mode only; live mode reads `sponsorships`.
import type { HowStep, SponsorRow, SponsorsView } from '@/lib/sponsorships-view';

/** The demo's four steps (mock mode names the sample admin, as the demo does). */
export const HOW_MOCK: HowStep[] = [
  { title: 'A request comes in', body: 'A student or an organization asks for help, in the board chat or by email to the board.' },
  { title: 'The board agrees in chat', body: 'Board members talk it over and agree on an amount.' },
  { title: 'Dana Mercer pays and keeps the receipt', body: '' },
  { title: 'It is logged once, here', body: 'Logging it also records the spending on Budget, under Sponsorships. Log it once, here.', here: true },
];

const NSBE: SponsorRow = { id: 's1', title: 'NSBE convention', kind: 'conference', students: 5, cents: 275_000, when: 'Spring 2026', on: '2026-04-18', state: 'done' };

/** The normal state: one sponsorship this year. */
export const SPONSORS_VIEW: SponsorsView = {
  // After Dec 5, so the field's example ("... $600 Dec 5") is a past day of this year, as the demo draws it (a typed day
  // still to come means last year's; lib/sponsorships-map.ts readLine).
  today: '2026-12-10',
  year: 2026,
  rows: [NSBE],
  how: HOW_MOCK,
  loadFailed: false,
  caps: { log: true, undo: true },
  mockWrite: null,
};

/** The stress state: more students, and the longest real title still waiting (the news card). */
export const SPONSORS_VIEW_STRESS: SponsorsView = {
  ...SPONSORS_VIEW,
  rows: [
    { ...NSBE, students: 12, cents: 341_000 },
    { id: 's2', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', kind: 'conference', students: 0, cents: 0, when: 'Thu Dec 31', on: '2026-12-31', state: 'planned' },
  ],
};

/** The empty state: nothing logged this year. */
export const SPONSORS_VIEW_EMPTY: SponsorsView = { ...SPONSORS_VIEW, rows: [] };

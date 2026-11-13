// MOCK: the refreshed Grants page's sample (demo p-grants), on the demo's day, Tue Nov 10, 2026, viewed by Dana Mercer.
// The two Researching rows are starter ideas, so the page counts no real grants yet ("Won so far $0"). Stress adds the
// longest grant name, 120 Researching and one Submitted; Empty has no grants (the checklist stays).
import { MOCK_CAPS } from '@/lib/grants-map';
import type { GrantItem, GrantsView, GrantStep, GrantWho } from '@/lib/grants-view';

const P = (id: string, name: string, initials: string): GrantWho => ({ kind: 'person', id, name, first: name.split(' ')[0], initials, me: id === 'dm' });
const DM = P('dm', 'Dana Mercer', 'DM');
const KD = P('kd', 'Keith Dawson', 'KD');
const CK = P('ck', 'Camila Keane', 'CK');
const DS = P('ds', 'Dorian Sutton', 'DS');
const BOARD: GrantWho = { kind: 'group', name: 'Board' };

// A grant with the defaults the sample leaves out.
const G = (g: Partial<GrantItem> & Pick<GrantItem, 'id' | 'name' | 'stage'>): GrantItem => ({
  funder: null,
  amountCents: null,
  upTo: false,
  outcome: null,
  deadlineOn: null,
  dateNote: null,
  submittedOn: null,
  decidedOn: null,
  owner: null,
  ...g,
});

const IDEAS: GrantItem[] = [
  G({ id: 'gr1', name: 'STEM education grant', amountCents: 1_000_000, upTo: true, stage: 'researching' }),
  G({ id: 'gr2', name: 'Community fund', amountCents: 500_000, stage: 'researching', dateNote: 'Opens in January' }),
];

// The four steps; stress gives them other owners, a long title and late dates.
function steps(stress: boolean): GrantStep[] {
  return [
    { id: 'k1', title: 'Decide grants are worth trying', kind: 'Decision', who: BOARD, due: '2026-10-01', done: true },
    { id: 'k2', title: 'Shortlist 5 grants to apply for', kind: 'List', who: stress ? DS : KD, due: stress ? '2026-12-31' : '2026-11-16', done: false },
    {
      id: 'k3',
      title: stress ? 'Announce the Legacy Scholarship at the NSBE event and cocktail hour' : 'Write a one-page BTX summary for applications',
      kind: 'Document',
      who: stress ? CK : DM,
      due: stress ? '2026-09-30' : '2026-11-20',
      done: false,
    },
    { id: 'k4', title: 'Gather the 501(c)(3) letter and the 2026 budget', kind: 'Documents', who: stress ? CK : DM, due: stress ? '2026-09-30' : '2026-11-20', done: false },
  ];
}

const BASE = { today: '2026-11-10', now: '2026-11-10T09:14:00-05:00', budgetCount: 1, loadFailed: false, caps: MOCK_CAPS };

export const GRANTS_VIEW: GrantsView = {
  ...BASE,
  grants: IDEAS,
  counts: { researching: 2, writing: 0, submitted: 0, decided: 0 },
  checklist: { title: 'Getting started with grants', steps: steps(false) },
};

export const GRANTS_VIEW_STRESS: GrantsView = {
  ...BASE,
  grants: [
    ...IDEAS,
    G({ id: 'gr3', name: 'National Society of Black Engineers Professionals Scholarship Program', amountCents: 19_000_000, stage: 'submitted', submittedOn: '2026-09-30' }),
  ],
  counts: { researching: 120, writing: 0, submitted: 1, decided: 0 },
  checklist: { title: 'Getting started with grants', steps: steps(true) },
};

export const GRANTS_VIEW_EMPTY: GrantsView = {
  ...BASE,
  grants: [],
  counts: { researching: 0, writing: 0, submitted: 0, decided: 0 },
  checklist: { title: 'Getting started with grants', steps: steps(false) },
};

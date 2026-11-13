// Mock-mode samples for the refreshed Budget page and its approval page (lib/budget-view.ts), copied from the demo
// (apps/design/ops-refresh/directions/p-budget, makeData()): normal, stress and empty. Dates are in the week of Tue Nov 10,
// 2026, as on Today; the approval step is the same item as Today's and Tasks' "Approve the Q4 budget ($4,830)".
import { mockCaps } from '@/lib/budget-map';
import type { BudgetView, BuAuthor, BuCategory, BuStep, BuWho } from '@/lib/budget-view';

const P = {
  dm: { name: 'Dana Mercer', initials: 'DM' },
  kd: { name: 'Keith Dawson', initials: 'KD' },
  ck: { name: 'Camila Keane', initials: 'CK' },
  ds: { name: 'Dorian Sutton', initials: 'DS' },
};
type Pid = keyof typeof P;
const ME: Pid = 'dm';

// A step owner and a comment or message author, from the sample's people.
const who = (id: Pid): BuWho => ({ kind: 'person', ...P[id], me: id === ME });
const by = (id: Pid): BuAuthor => ({ ...P[id], me: id === ME });

// The sample in one of its three states.
function sample(state: 'normal' | 'stress' | 'empty'): BudgetView {
  const stress = state === 'stress';
  const empty = state === 'empty';
  const usd = (d: number) => d * 100;
  const cats: BuCategory[] = [
    { id: 'sch', name: 'Scholarships', sub: null, budgetCents: usd(2500), spentCents: 0, quarterSpentCents: 0, planCents: usd(empty ? 0 : 2500), isNew: false },
    { id: 'spo', name: 'Sponsorships', sub: 'NSBE convention', budgetCents: usd(3000), spentCents: usd(stress ? 3410 : 2750), quarterSpentCents: 0, planCents: usd(stress || empty ? 0 : 250), isNew: false },
    { id: 'cer', name: 'Certification program', sub: null, budgetCents: usd(1500), spentCents: 0, quarterSpentCents: 0, planCents: usd(empty ? 0 : 1500), isNew: !empty },
    { id: 'ops', name: 'Operations', sub: 'website, software, filing', budgetCents: usd(1200), spentCents: usd(860), quarterSpentCents: 0, planCents: usd(empty ? 0 : 340), isNew: false },
    { id: 'out', name: 'Outreach', sub: 'newsletter, Instagram', budgetCents: usd(300), spentCents: usd(60), quarterSpentCents: 0, planCents: usd(empty ? 0 : 240), isNew: false },
  ];
  const step = (id: string, title: string, owner: Pid, due: string, done: boolean, approval = false): BuStep => ({ id, title, who: who(owner), due, done, doneOn: null, approval });
  const steps: BuStep[] = [
    step('st1', 'Log Q3 spending', 'dm', stress ? '2026-09-30' : '2026-11-09', true),
    step('st2', 'Draft the Q4 plan', stress ? 'ds' : 'kd', stress ? '2026-09-30' : '2026-11-08', !empty),
    step('st3', 'Approve the Q4 budget', 'dm', stress ? '2026-12-31' : '2026-11-13', false, true),
    step('st4', 'Share the Q4 budget with the board', stress ? 'ck' : 'kd', stress ? '2026-12-31' : '2026-11-16', false),
  ];
  const from = stress ? P.ds : P.kd;
  // Instants on Tue Nov 10 in Eastern time (UTC-5 in November).
  const comments = stress
    ? [
        { id: 'c1', by: by('ds'), at: '2026-11-10T13:00:00Z', body: 'Looks right to me. The certification line is the new one.' },
        { id: 'c2', by: by('ck'), at: '2026-11-11T02:30:00Z', body: 'Approving tonight. Sponsorships is $0 for Q4 because the NSBE line is spent.' },
      ]
    : [{ id: 'c1', by: by('kd'), at: '2026-11-10T13:02:00Z', body: 'Looks right to me. The certification line is the new one.' }];
  const chat = stress
    ? [{ id: 'm1', by: by('ck'), at: '2026-11-11T02:30:00Z', body: "I'll pull a list of grants we could apply for by the 16th." }]
    : empty
      ? []
      : [{ id: 'm1', by: by('kd'), at: '2026-11-10T14:20:00Z', body: "I'll pull a list of grants we could apply for by the 16th." }];
  return {
    today: '2026-11-10',
    year: 2026,
    cats,
    // The demo's line order (LINE_ORDER).
    lineOrder: ['sch', 'cer', 'ops', 'spo', 'out'],
    plan: {
      id: 'plan-q4',
      taskId: 'st3',
      quarter: 4,
      status: empty ? 'none' : 'waiting',
      due: stress ? '2026-12-31' : '2026-11-13',
      from: { name: from.name, first: from.name.split(' ')[0] },
      declineNote: null,
      decidedBy: null,
      decidedAt: null,
    },
    steps,
    comments: { count: stress ? 120 : 1, list: comments },
    spend: [],
    spendAll: { count: 0, cents: 0 },
    prevQuarterCents: usd(460),
    funds: { cents: usd(stress ? 190000 : 18600), asOf: '2026-11-09', by: by('dm') },
    chat: { failed: false, messages: chat },
    loadFailed: false,
    caps: mockCaps(),
  };
}

export const BUDGET_VIEW = sample('normal');
export const BUDGET_VIEW_STRESS = sample('stress');
export const BUDGET_VIEW_EMPTY = sample('empty');

// The Budget page's pure logic (lib/budget-map.ts): money sums, words for dates, steps, the news card, the quick-add parser,
// the approve/decline guard, paging and the row mappers.
import { describe, expect, it } from 'vitest';
import {
  BU_ID_CHUNK,
  BudgetReadTruncated,
  canDecide,
  chunks,
  doneWord,
  dueWord,
  fallbackQuarter,
  isPlanId,
  quarterOf,
  headDate,
  leftOf,
  lineOrder,
  liveCaps,
  mapCategory,
  mapFunds,
  mapMsg,
  mapPlan,
  mapSpend,
  mapStep,
  mockCaps,
  money,
  msgTime,
  newsFor,
  pageAll,
  parseAmount,
  parseSpend,
  pastWord,
  pct,
  planStatus,
  prevQuarter,
  quarterRange,
  splitName,
  stepMarks,
  stepWhen,
  sumByCategory,
  totals,
  yearCaption,
  type People,
} from '@/lib/budget-map';
import type { BuStep } from '@/lib/budget-view';

const T = '2026-11-10'; // a Tuesday
const cat = (id: string, budget: number, spent: number, plan: number, qSpent = 0) => ({ id, name: id, budgetCents: budget, spentCents: spent, planCents: plan, quarterSpentCents: qSpent });

describe('money', () => {
  it('draws whole dollars with commas', () => {
    expect(money(483_000)).toBe('$4,830');
    expect(money(0)).toBe('$0');
    expect(money(4_999)).toBe('$50');
  });
  it('never draws "$0" for a non-zero amount: cents under a dollar', () => {
    expect([0, 1, 49, 50, 99, 100, 149, 150].map(money)).toEqual(['$0', '$0.01', '$0.49', '$0.50', '$0.99', '$1', '$1', '$2']);
    expect(money(-49)).toBe('-$0.49');
  });
  it('the year caption with cents: 1 cent over, 49 and 50 cents left, exactly used up', () => {
    const t = totals([cat('a', 10_000, 4_000, 6_001)]);
    const over = yearCaption(t);
    expect([over.kind, money(over.cents)]).toEqual(['over', '$0.01']);
    const left49 = yearCaption(totals([cat('a', 10_000, 4_000, 5_951)]));
    expect([left49.kind, money(left49.cents)]).toEqual(['left', '$0.49']);
    const left50 = yearCaption(totals([cat('a', 10_000, 4_000, 5_950)]));
    expect([left50.kind, money(left50.cents)]).toEqual(['left', '$0.50']);
    expect(yearCaption(totals([cat('a', 10_000, 4_000, 6_000)]))).toEqual({ kind: 'exact', cents: 0 });
  });
  it('pct is 0 over a zero whole', () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33);
  });
  it('leftOf never goes below zero', () => {
    expect(leftOf({ planCents: 100, quarterSpentCents: 30 })).toBe(70);
    expect(leftOf({ planCents: 100, quarterSpentCents: 300 })).toBe(0);
  });
  it('totals and the year caption: left, exact, over', () => {
    const t = totals([cat('a', 1000, 200, 300, 100), cat('b', 500, 0, 100)]);
    expect(t).toEqual({ budget: 1500, spent: 200, left: 300, plan: 400, after: 500 });
    expect(yearCaption(t)).toEqual({ kind: 'left', cents: 1000 });
    expect(yearCaption({ ...t, after: 1500 })).toEqual({ kind: 'exact', cents: 0 });
    expect(yearCaption({ ...t, after: 1600 })).toEqual({ kind: 'over', cents: 100 });
  });
});

describe('names and statuses', () => {
  it('splitName takes the bracket as the sub line', () => {
    expect(splitName('Operations (website, software, filing)')).toEqual({ name: 'Operations', sub: 'website, software, filing' });
    expect(splitName(' Outreach ')).toEqual({ name: 'Outreach', sub: null });
  });
  it('planStatus: a draft or a missing row is "none"', () => {
    expect(['awaiting_approval', 'approved', 'declined', 'draft', undefined].map(planStatus)).toEqual(['waiting', 'approved', 'declined', 'none', 'none']);
  });
  it('canDecide needs a real plan and approval task still waiting', () => {
    expect(canDecide({ id: 'p', taskId: 't', status: 'waiting' })).toBe(true);
    expect(canDecide({ id: '', taskId: 't', status: 'waiting' })).toBe(false);
    expect(canDecide({ id: 'p', taskId: '', status: 'waiting' })).toBe(false);
    expect(canDecide({ id: 'p', taskId: 't', status: 'approved' })).toBe(false);
  });
});

describe('stepMarks', () => {
  const steps = [{ done: true, approval: false }, { done: true, approval: false }, { done: false, approval: true }, { done: false, approval: false }];
  it('waiting: the approval step is "Now"', () => expect(stepMarks(steps, 'waiting')).toEqual({ done: [true, true, false, false], now: 2 }));
  it('approved: the approval step is done', () => expect(stepMarks(steps, 'approved')).toEqual({ done: [true, true, true, false], now: 3 }));
  it('declined: the drafting step opens again', () => expect(stepMarks(steps, 'declined')).toEqual({ done: [true, false, false, false], now: 1 }));
});

describe('words for dates', () => {
  it('headDate', () => expect(headDate(T)).toBe('Tue, Nov 10'));
  it('pastWord: today, yesterday, this week, older', () => {
    expect([T, '2026-11-09', '2026-11-08', '2026-11-01'].map((d) => pastWord(T, d))).toEqual(['Today', 'Yesterday', 'Sun', 'Nov 1']);
  });
  it('doneWord lower-cases today and yesterday', () => {
    expect(doneWord(T, '2026-11-09')).toBe('Done yesterday');
    expect(doneWord(T, '2026-11-08')).toBe('Done Sun');
  });
  it('dueWord says "Due" ahead and lateness behind; stepWhen words a past day plainly', () => {
    expect(dueWord(T, '2026-11-13')).toBe('Due Fri');
    expect(dueWord(T, '2026-11-08')).not.toMatch(/^Due/);
    expect(stepWhen(T, '2026-11-08')).toBe('Sun');
    expect(stepWhen(T, '2026-11-13')).toBe('Fri');
  });
  it('msgTime: a clock today, a day word before, "just now" for a pending one', () => {
    expect(msgTime(T, '2026-11-10T14:20:00Z')).toBe('9:20 AM');
    expect(msgTime(T, '2026-11-09T14:20:00Z')).toBe('Yesterday');
    expect(msgTime(T, null)).toBe('just now');
  });
});

describe('quarters', () => {
  it('quarterRange ends on the first day after the quarter', () => {
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2027-01-01' });
    expect(quarterRange(2026, 3)).toEqual({ from: '2026-07-01', to: '2026-10-01' });
  });
  it('prevQuarter wraps the year', () => {
    expect(prevQuarter(2027, 1)).toEqual({ year: 2026, q: 4 });
    expect(prevQuarter(2026, 4)).toEqual({ year: 2026, q: 3 });
  });
  it('quarterOf', () => {
    expect(['2027-01-05', '2026-03-31', '2026-04-01', '2026-09-30', '2026-11-10'].map(quarterOf)).toEqual([1, 1, 2, 3, 4]);
  });
  it('fallbackQuarter: this quarter when this year has a budget, else the newest year', () => {
    expect(fallbackQuarter('2026-11-10', [2027, 2026])).toEqual({ year: 2026, quarter: 4 });
    expect(fallbackQuarter('2026-11-10', [])).toEqual({ year: 2026, quarter: 4 });
    expect(fallbackQuarter('2027-01-05', [2026, 2025])).toEqual({ year: 2026, quarter: 4 });
    expect(fallbackQuarter('2026-05-01', [2027])).toEqual({ year: 2027, quarter: 1 });
  });
  it('isPlanId accepts only a uuid', () => {
    expect(isPlanId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(['', 'plan-q4', '11111111-1111-4111-8111-11111111111', "x' or 1=1", undefined, 5].map(isPlanId)).toEqual([false, false, false, false, false, false]);
  });
  it('mapCategory reads the plan quarter\'s column, and none for a draft', () => {
    const row = { category_id: 'c', name: 'A', budget_cents: 100, spent_cents: 0, q1_plan_cents: 11, q4_plan_cents: 44 };
    expect(mapCategory(row, new Map(), 1).planCents).toBe(11);
    expect(mapCategory(row, new Map(), 4).planCents).toBe(44);
    expect(mapCategory(row, new Map(), 2).planCents).toBe(0);
    expect(mapCategory(row, new Map(), 4, false).planCents).toBe(0);
  });
});

describe('newsFor', () => {
  const from = { name: 'Keith Dawson', first: 'Keith' };
  const me = { kind: 'person' as const, name: 'Dana Mercer', initials: 'DM', me: true };
  it('waiting on the viewer: gold "Needs your approval"', () => {
    expect(newsFor({ status: 'waiting', from, quarter: 4 }, 483_000, me)).toEqual({ gold: true, icon: 'approve', kicker: 'Needs your approval', title: 'Q4 plan, $4,830', go: 'Review' });
  });
  it('waiting on someone else: names them, not gold', () => {
    const n = newsFor({ status: 'waiting', from, quarter: 4 }, 483_000, { ...me, name: 'Camila Keane', me: false });
    expect(n).toMatchObject({ gold: false, kicker: 'Waiting on Camila' });
  });
  it('no plan, declined, approved', () => {
    expect(newsFor({ status: 'none', from, quarter: 4 }, 0, me)).toMatchObject({ kicker: 'Waiting on Keith', title: 'Q4 plan draft', go: 'See it' });
    expect(newsFor({ status: 'declined', from: null, quarter: 4 }, 0, me)).toMatchObject({ kicker: 'Waiting on a draft', title: 'Revised Q4 plan' });
    expect(newsFor({ status: 'approved', from, quarter: 4 }, 0, me)).toBeNull();
  });
});

describe('quick-add spending', () => {
  const cats = [{ id: 'ops', name: 'Operations' }, { id: 'out', name: 'Outreach' }];
  it('parseAmount reads $ and commas and cents', () => {
    expect(parseAmount('$1,200.50 thing')).toEqual({ value: 1200.5, raw: '$1,200.50' });
    expect(parseAmount('no money')).toBeNull();
  });
  it('parseSpend picks the category and drops a trailing tag word', () => {
    expect(parseSpend('$45 domain renewal, website', cats)).toEqual({ dollars: 45, catId: 'ops', title: 'Domain renewal' });
    expect(parseSpend('$120 zoom outreach', cats)).toEqual({ dollars: 120, catId: 'out', title: 'Zoom outreach' });
    expect(parseSpend('pizza', cats)).toEqual({ dollars: null, catId: null, title: 'Pizza' });
  });
});

describe('caps', () => {
  it('live mode switches every money write and mock-only action off', () => {
    expect(Object.values(liveCaps()).every((x) => x === false)).toBe(true);
    expect(Object.values(mockCaps()).every((x) => x === true)).toBe(true);
  });
});

describe('paging', () => {
  it('pageAll advances by the rows returned and stops on an empty page', async () => {
    const asked: [number, number][] = [];
    const data = Array.from({ length: 5 }, (_, i) => i);
    const rows = await pageAll('t', async (from, to) => {
      asked.push([from, to]);
      return data.slice(from, Math.min(to + 1, from + 2)); // a server that returns fewer rows than asked
    }, 3);
    expect(rows).toEqual(data);
    expect(asked[1][0]).toBe(2);
  });
  it('pageAll throws past the ceiling, never a partial sum', async () => {
    await expect(pageAll('spending_entries', async () => [1], 1, 3)).rejects.toBeInstanceOf(BudgetReadTruncated);
  });
  it('chunks ids at 100', () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    expect(chunks(ids).map((c) => c.length)).toEqual([BU_ID_CHUNK, BU_ID_CHUNK, 50]);
  });
});

describe('row mapping', () => {
  const people: People = new Map([['u1', { name: 'Keith Dawson', initials: 'KD' }], ['me', { name: 'Dana Mercer', initials: 'DM' }]]);
  it('mapCategory splits the name and adds the quarter spend', () => {
    const c = mapCategory({ category_id: 'c1', name: 'Operations (website)', budget_cents: 100, spent_cents: 50, q4_plan_cents: 30 }, new Map([['c1', 20]]));
    expect(c).toEqual({ id: 'c1', name: 'Operations', sub: 'website', budgetCents: 100, spentCents: 50, quarterSpentCents: 20, planCents: 30, isNew: false });
  });
  it('mapStep: a person, a group, nobody', () => {
    expect(mapStep({ id: 't', title: 'X', status: 'done', completed_at: '2026-11-09T15:00:00Z', type: 'approval' }, 'me', people, 'me')).toMatchObject({ who: { kind: 'person', me: true }, done: true, doneOn: '2026-11-09', approval: true });
    expect(mapStep({ id: 't', assignee_group: 'board' }, undefined, people, 'me').who).toEqual({ kind: 'group', name: 'Board' });
    expect(mapStep({ id: 't' }, undefined, people, 'me').who).toEqual({ kind: 'none' });
  });
  it('mapSpend, mapFunds, mapMsg', () => {
    expect(mapSpend({ id: 's', spent_on: '2026-11-02', description: 'Zoom', amount_cents: 1500, category_id: 'c', budget_categories: { name: 'Outreach (ads)' } })).toEqual({ id: 's', on: '2026-11-02', categoryId: 'c', category: 'Outreach', title: 'Zoom', cents: 1500 });
    expect(mapFunds(undefined, people, 'me')).toBeNull();
    expect(mapFunds({ amount_cents: 5, as_of: '2026-11-09T00:00:00Z', recorded_by: 'me' }, people, 'me')).toEqual({ cents: 5, asOf: '2026-11-09', by: { name: 'Dana Mercer', initials: 'DM', me: true } });
    expect(mapMsg({ id: 'm', is_bot: true, body: 'Hi', created_at: 'x' }, people, 'me').by.name).toBe('BTX');
  });
  it('mapPlan: back to the submitter, else the drafting step owner; no row is "none"', () => {
    const steps: BuStep[] = [
      { id: 'd', title: 'Draft', who: { kind: 'person', name: 'Keith Dawson', initials: 'KD', me: false }, due: null, done: true, doneOn: null, approval: false },
      { id: 'a', title: 'Approve', who: { kind: 'none' }, due: '2026-11-13', done: false, doneOn: null, approval: true },
    ];
    const p = mapPlan({ id: 'p', quarter: 4, status: 'awaiting_approval' }, steps[1], steps, people, 'me', 4);
    expect(p).toMatchObject({ id: 'p', taskId: 'a', status: 'waiting', due: '2026-11-13', from: { name: 'Keith Dawson', first: 'Keith' } });
    expect(mapPlan(undefined, undefined, [], people, 'me', 4)).toMatchObject({ id: '', taskId: '', status: 'none', from: null });
  });
  it('lineOrder: biggest plan first, ties keep order; sumByCategory skips uncategorised rows', () => {
    expect(lineOrder([{ id: 'a', planCents: 1 }, { id: 'b', planCents: 5 }, { id: 'c', planCents: 1 }])).toEqual(['b', 'a', 'c']);
    expect([...sumByCategory([{ categoryId: 'a', cents: 1 }, { categoryId: null, cents: 9 }, { categoryId: 'a', cents: 2 }])]).toEqual([['a', 3]]);
  });
});

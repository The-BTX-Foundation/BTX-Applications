// The Fundraising page's pure logic (lib/fundraising-map.ts) and its mock flags (lib/fundraising-view-loader.ts).
import { describe, expect, it } from 'vitest';
import {
  applyGift,
  cnt,
  dateLabel,
  dollars,
  dollarsUp,
  fundraisingNews,
  giftFigures,
  mapGifts,
  mapSteps,
  newestGifts,
  nextStep,
  nudgeText,
  parseAmount,
  parseGift,
  stepDue,
  toggleStep,
  waitsOnOther,
} from '@/lib/fundraising-map';
import { mockFundraising } from '@/lib/fundraising-view-loader';
import { FUNDRAISING_VIEW } from '@/mock/fundraising-view';
import type { FrStep } from '@/lib/fundraising-view';

const TODAY = '2026-11-10';
const step = (o: Partial<FrStep>): FrStep => ({ id: 's', title: 'Draft the donor letter', kind: 'Letter', owner: { kind: 'none' }, due: '2026-11-13', done: false, ...o });
const KEITH = { kind: 'person' as const, id: 'kd', name: 'Keith Dawson', first: 'Keith', initials: 'KD' };

describe('formatting', () => {
  it('shows whole dollars, badge counts and the header date', () => {
    expect(dollars(980_000)).toBe('$9,800');
    expect(dollars(36_049)).toBe('$360');
    expect(cnt(27)).toBe('27');
    expect(cnt(120)).toBe('99+');
    expect(dateLabel(TODAY)).toBe('Tue, Nov 10');
  });
});

describe('parseAmount / parseGift', () => {
  it('reads $, decimals and thousands', () => {
    expect(parseAmount('$50 Jordan')).toEqual({ cents: 5000, raw: '$50' });
    expect(parseAmount('45.50')?.cents).toBe(4550);
    expect(parseAmount('1,200 from Ana')?.cents).toBe(120_000);
    expect(parseAmount('Jordan Pierce')).toBeNull();
    expect(parseAmount('$0')).toBeNull();
  });
  it('splits a typed line into amount, donor, source and monthly', () => {
    expect(parseGift('$50 Jordan Pierce monthly')).toEqual({ cents: 5000, source: 'individual', monthly: true, donor: 'Jordan Pierce' });
    expect(parseGift('$500 employer match from Acme')).toEqual({ cents: 50_000, source: 'corporate', monthly: false, donor: 'match Acme' });
    expect(parseGift('$75 gala').source).toBe('event');
    expect(parseGift('grant $1,000').source).toBe('grant');
    expect(parseGift('Jordan').cents).toBeNull();
    expect(parseGift('$20').donor).toBe('');
  });
});

describe('applyGift', () => {
  it('adds a gift and takes it away again', () => {
    const t0 = { raisedCents: 100, donors: 1, newDonors: 0, monthlyDonors: 0, sources: FUNDRAISING_VIEW.sources };
    const g = { amountCents: 5000, source: 'event' as const, monthly: true };
    const t1 = applyGift(t0, g, 1);
    expect(t1.raisedCents).toBe(5100);
    expect([t1.donors, t1.newDonors, t1.monthlyDonors]).toEqual([2, 1, 1]);
    expect(t1.sources.find((s) => s.key === 'event')?.cents).toBe(105_000);
    expect(applyGift(t1, g, -1)).toEqual(t0);
  });
  it('never takes a count below zero', () => {
    const t = applyGift({ raisedCents: 0, donors: 0, newDonors: 0, monthlyDonors: 0, sources: [] }, { amountCents: 0, source: 'individual', monthly: true }, -1);
    expect([t.donors, t.newDonors, t.monthlyDonors]).toEqual([0, 0, 0]);
  });
});

describe('the news card', () => {
  it('says what is left until the goal is met', () => {
    expect(fundraisingNews(1_500_000, 980_000)).toEqual({ left: 520_000, goal: 1_500_000 });
    expect(fundraisingNews(1_500_000, 1_500_000)).toBeNull();
    expect(fundraisingNews(null, 0)).toBeNull();
    expect(fundraisingNews(0, 0)).toBeNull();
  });
  it('rounds the money to go up, never "$0 to go" while cents are left', () => {
    const n = fundraisingNews(1_500_000, 1_499_950);
    expect(n?.left).toBe(50);
    expect(dollarsUp(n?.left ?? 0)).toBe('$1');
    expect(dollarsUp(520_001)).toBe('$5,201');
  });
});

describe('steps', () => {
  it('maps task rows in position order, with owner, group or nobody, leaving declined ones out', () => {
    const tasks = [
      { id: 't2', title: 'B', note: 'Letter', due_on: '2026-11-13', status: 'open', position: 2 },
      { id: 't1', title: 'A', note: 'Goal', due_on: '2026-10-02', status: 'done', position: 1 },
      { id: 't3', title: 'C', note: null, due_on: null, status: 'open', assignee_group: 'board', position: 3 },
      { id: 't4', title: 'D', status: 'declined', position: 4 },
      { id: 't5', title: 'E', status: 'open', position: 5 },
    ];
    const steps = mapSteps(tasks, [{ task_id: 't2', user_id: 'u1' }], [{ user_id: 'u1', display_name: 'Keith Dawson', initials: 'KD' }]);
    expect(steps.map((s) => s.id)).toEqual(['t1', 't2', 't3', 't5']);
    expect(steps[0].done).toBe(true);
    expect(steps[1].owner).toEqual({ kind: 'person', id: 'u1', name: 'Keith Dawson', first: 'Keith', initials: 'KD' });
    expect(steps[2].owner).toEqual({ kind: 'group', name: 'Board' });
    expect(steps[2].kind).toBe('');
    expect(steps[3].owner).toEqual({ kind: 'none' });
    expect(nextStep(steps)?.id).toBe('t2');
  });
  it('words the due day: done, late, plain words', () => {
    expect(stepDue(TODAY, step({ done: true })).text).toBe('Done');
    expect(stepDue(TODAY, step({ due: '2026-11-09' }))).toMatchObject({ kind: 'late', text: '1 day late' });
    expect(stepDue(TODAY, step({ due: '2026-11-07' })).text).toBe('3 days late');
    expect(stepDue(TODAY, step({ due: '2026-11-13' }))).toMatchObject({ kind: 'when', text: 'Fri' });
    expect(stepDue(TODAY, step({ due: null })).kind).toBe('none');
  });
  it('waits on someone else only when the next step is another person\'s', () => {
    expect(waitsOnOther(step({ owner: KEITH }), 'dm')).toBe(true);
    expect(waitsOnOther(step({ owner: KEITH }), 'kd')).toBe(false);
    expect(waitsOnOther(step({ owner: { kind: 'group', name: 'Board' } }), 'dm')).toBe(false);
    expect(waitsOnOther(undefined, 'dm')).toBe(false);
  });
  it('drafts the nudge with the due day in words', () => {
    expect(nudgeText(TODAY, step({}), 'Keith')).toBe('Hi Keith, how is "draft the donor letter" coming along? It\'s due Friday.');
    expect(nudgeText(TODAY, step({ due: '2026-11-11' }), 'Keith')).toContain("It's due tomorrow.");
    expect(nudgeText(TODAY, step({ due: null }), 'Keith')).toBe('Hi Keith, how is "draft the donor letter" coming along?');
  });
  it('ticks one step and back', () => {
    const c = { title: 'Year-end giving', steps: [step({ id: 'a' }), step({ id: 'b' })] };
    const c1 = toggleStep(c, 'a');
    expect(c1.steps.map((s) => s.done)).toEqual([true, false]);
    expect(toggleStep(c1, 'a')).toEqual(c);
  });
});

describe('gifts', () => {
  const rows = [
    { id: 'g1', gift_on: '2025-12-01', amount_cents: 10_000, source: 'individual', donor_id: 'd1' },
    { id: 'g2', gift_on: '2026-08-15', amount_cents: 20_000, source: 'corporate', donor_id: 'd1', monthly: true },
    { id: 'g3', gift_on: '2026-11-02', amount_cents: 30_000, source: 'nonsense', donor_id: 'd2' },
    { id: 'g4', gift_on: '2026-11-02', amount_cents: 5_000, source: 'event', donor_id: null },
  ];
  it('counts this year\'s figures from every year\'s gifts', () => {
    const f = giftFigures(rows, 2026);
    expect(f.raisedCents).toBe(55_000);
    expect(f.q3Cents).toBe(20_000);
    expect(f.donors).toBe(2);
    expect(f.newDonors).toBe(1);
    expect(f.monthlyDonors).toBe(1);
  });
  it('keeps the newest gifts, then names them (no name = anonymous, unknown source = individual)', () => {
    const n = newestGifts(rows, 2);
    expect(n.map((g) => g.id)).toEqual(['g4', 'g3']);
    const g = mapGifts(n, new Map([['d2', 'Ana Ruiz']]));
    expect(g[0]).toMatchObject({ donor: null, source: 'event', amountCents: 5_000, giftOn: '2026-11-02' });
    expect(g[1]).toMatchObject({ donor: 'Ana Ruiz', source: 'individual' });
  });
  it('orders same-day gifts by when they were logged, then id', () => {
    const same = [
      { id: 'a', gift_on: '2026-11-02', created_at: '2026-11-02T10:00:00Z' },
      { id: 'b', gift_on: '2026-11-02', created_at: '2026-11-02T09:00:00Z' },
      { id: 'c', gift_on: '2026-11-02', created_at: '2026-11-02T09:00:00Z' },
    ];
    expect(newestGifts(same).map((g) => g.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('mockFundraising', () => {
  it('maps every ?demo flag', () => {
    expect(mockFundraising('failed')).toEqual({ failed: true });
    const n = mockFundraising();
    if (n.failed) throw new Error('failed');
    expect([n.loadFailed, n.donors, n.checklist?.steps.length]).toEqual([false, 27, 5]);
    const s = mockFundraising('stress');
    if (s.failed) throw new Error('failed');
    expect(s.donors).toBe(120);
    const e = mockFundraising('empty');
    if (e.failed) throw new Error('failed');
    expect(e.raisedCents).toBe(0);
    const er = mockFundraising('error');
    if (er.failed) throw new Error('failed');
    expect(er.loadFailed).toBe(true);
    const nl = mockFundraising('nolist');
    if (nl.failed) throw new Error('failed');
    expect(nl.checklist).toBeNull();
    expect(n.caps).toEqual({ logGift: true, giftUndo: true, tick: true, nudge: true });
  });
});

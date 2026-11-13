// The Grants page's pure logic (lib/grants-map.ts): the words it draws, the row mapping and order, the news card, the
// "Add a grant" parser, and the paging helpers.
import { describe, expect, it } from 'vitest';
import {
  amountText,
  chunk,
  cnt,
  dateLine,
  doneTitle,
  dueWords,
  grantsNews,
  LIVE_CAPS,
  mapGrants,
  mapPeople,
  mapSteps,
  money,
  nudgeText,
  pageAll,
  parseGrant,
  realCount,
  stageCounts,
  stepTitle,
  titleDate,
} from '@/lib/grants-map';
import type { GrantItem, GrantStep } from '@/lib/grants-view';

const TODAY = '2026-11-10'; // a Tuesday
const PEOPLE = mapPeople([
  { user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' },
  { user_id: 'u-kd', display_name: 'Keith Dawson', initials: 'KD' },
]);

// A grant with every field set to "nothing", then the overrides.
const grant = (o: Partial<GrantItem>): GrantItem => ({
  id: 'g',
  name: 'A grant',
  funder: null,
  amountCents: null,
  upTo: false,
  stage: 'researching',
  outcome: null,
  deadlineOn: null,
  dateNote: null,
  submittedOn: null,
  decidedOn: null,
  owner: null,
  ...o,
});

// A step with defaults, then the overrides.
const step = (o: Partial<GrantStep>): GrantStep => ({ id: 's', title: 'Shortlist 5 grants to apply for', kind: 'List', who: null, due: null, done: false, ...o });

describe('words', () => {
  it('draws amounts in whole dollars, cents only when there are some, with "Up to" and the not-set case', () => {
    expect(money(1_000_000)).toBe('$10,000');
    expect(money(1_000_050)).toBe('$10,000.50');
    expect(amountText({ amountCents: 1_000_050, upTo: true })).toBe('Up to $10,000.50');
    expect(money(99)).toBe('$0.99');
    expect(amountText({ amountCents: 1_000_000, upTo: true })).toBe('Up to $10,000');
    expect(amountText({ amountCents: 500_000, upTo: false })).toBe('$5,000');
    expect(amountText({ amountCents: null, upTo: true })).toBe('Amount not set');
    expect(cnt(120)).toBe('99+');
    expect(cnt(99)).toBe('99');
  });

  it('picks the date line: decision, submitted, note, deadline, none', () => {
    expect(dateLine(TODAY, grant({ stage: 'decided', outcome: 'won', decidedOn: '2026-10-03' }))).toEqual({ text: 'Won Oct 3', title: 'Saturday, October 3', late: false });
    expect(dateLine(TODAY, grant({ stage: 'decided', outcome: 'declined' })).text).toBe('Not funded');
    expect(dateLine(TODAY, grant({ stage: 'decided', outcome: 'declined', decidedOn: '2026-10-03' }))).toEqual({ text: 'Not funded · Oct 3', title: 'Saturday, October 3', late: false });
    expect(dateLine(TODAY, grant({ stage: 'submitted', submittedOn: '2026-09-30' })).text).toBe('Submitted Sep 30');
    expect(dateLine(TODAY, grant({ dateNote: 'Opens in January', deadlineOn: '2026-12-01' })).text).toBe('Opens in January');
    expect(dateLine(TODAY, grant({ deadlineOn: '2026-12-01' })).text).toBe('Deadline Dec 1');
    expect(dateLine(TODAY, grant({}))).toEqual({ text: 'No deadline yet', title: null, late: false });
  });

  it('marks a passed deadline late on a grant still being researched or written ("Was due ...")', () => {
    expect(dateLine(TODAY, grant({ stage: 'writing', deadlineOn: '2026-10-01' }))).toEqual({ text: 'Deadline passed Oct 1', title: 'Was due Thursday, October 1', late: true });
    expect(dateLine(TODAY, grant({ stage: 'researching', deadlineOn: '2026-11-09', dateNote: 'Rolling' })).late).toBe(true);
    // Today is not passed; a submitted grant's old deadline is not late.
    expect(dateLine(TODAY, grant({ deadlineOn: TODAY }))).toEqual({ text: 'Deadline Nov 10', title: 'Tuesday, November 10', late: false });
    expect(dateLine(TODAY, grant({ stage: 'submitted', deadlineOn: '2026-10-01' })).late).toBe(false);
  });

  it('adds the year only when it is not today\'s year (same year, cross year, year boundary)', () => {
    expect(dateLine(TODAY, grant({ deadlineOn: '2026-12-31' })).text).toBe('Deadline Dec 31');
    expect(dateLine(TODAY, grant({ deadlineOn: '2027-01-15' }))).toEqual({ text: 'Deadline Jan 15, 2027', title: 'Friday, January 15, 2027', late: false });
    expect(dateLine(TODAY, grant({ stage: 'writing', deadlineOn: '2025-12-01' }))).toEqual({ text: 'Deadline passed Dec 1, 2025', title: 'Was due Monday, December 1, 2025', late: true });
    expect(dateLine(TODAY, grant({ stage: 'decided', outcome: 'won', decidedOn: '2025-06-02' })).text).toBe('Won Jun 2, 2025');
    expect(dateLine(TODAY, grant({ stage: 'submitted', submittedOn: '2025-12-30' })).text).toBe('Submitted Dec 30, 2025');
    // Year boundary: on Jan 1, yesterday is last year and late; Dec 31 seen on Dec 31 has no year.
    expect(dateLine('2027-01-01', grant({ stage: 'writing', deadlineOn: '2026-12-31' }))).toEqual({ text: 'Deadline passed Dec 31, 2026', title: 'Was due Thursday, December 31, 2026', late: true });
    expect(dateLine('2026-12-31', grant({ deadlineOn: '2027-01-01' })).text).toBe('Deadline Jan 1, 2027');
    expect(stepTitle(TODAY, '2026-11-09')).toBe('Was due Monday, November 9');
    expect(stepTitle(TODAY, '2027-01-04')).toBe('Due Monday, January 4, 2027');
    expect(doneTitle(TODAY, '2025-11-09')).toBe('Sunday, November 9, 2025');
    expect(stepTitle(TODAY, null)).toBeUndefined();
  });

  it('says due days in calendar weeks', () => {
    expect(titleDate(TODAY)).toBe('Tue, Nov 10');
    expect(dueWords(TODAY, '2026-11-10')).toBe('today');
    expect(dueWords(TODAY, '2026-11-11')).toBe('tomorrow');
    expect(dueWords(TODAY, '2026-11-13')).toBe('Friday');
    expect(dueWords(TODAY, '2026-11-16')).toBe('next Monday');
    expect(dueWords(TODAY, '2026-12-31')).toBe('Thursday, December 31');
  });

  it('drafts the nudge', () => {
    const kd = { kind: 'person', id: 'u-kd', name: 'Keith Dawson', first: 'Keith', initials: 'KD', me: false } as const;
    expect(nudgeText(TODAY, step({ who: kd, due: '2026-11-16' }))).toBe('Hi Keith, how is "shortlist 5 grants to apply for" coming along? It\'s due next Monday.');
    expect(nudgeText(TODAY, step({ who: kd }))).toBe('Hi Keith, how is "shortlist 5 grants to apply for" coming along?');
  });
});

describe('news card', () => {
  const kd = { kind: 'person', id: 'u-kd', name: 'Keith Dawson', first: 'Keith', initials: 'KD', me: false } as const;
  const me = { ...kd, id: 'u-me', name: 'Dana Mercer', first: 'Dana', me: true } as const;

  it('puts a grant waiting on a decision first', () => {
    const g = grant({ name: 'NSBE grant', stage: 'submitted' });
    expect(grantsNews(TODAY, [g], 1, [step({ who: me })])).toMatchObject({ kicker: 'Waiting on a decision', title: 'NSBE grant', go: 'See it', gold: false });
  });

  it('else the next step: someone else\'s is "See it" with their name, the viewer\'s is gold "Open"', () => {
    const done = step({ id: 'a', done: true });
    expect(grantsNews(TODAY, [], 0, [done, step({ who: kd, due: '2026-11-16' })])).toEqual({ icon: 'wait', kicker: 'Due next Monday · Keith', title: 'Shortlist 5 grants to apply for', go: 'See it', gold: false });
    expect(grantsNews(TODAY, [], 0, [step({ who: me, due: '2026-11-07' })])).toMatchObject({ icon: 'alert', kicker: '3 days late', go: 'Open', gold: true });
    expect(grantsNews(TODAY, [], 0, [step({ who: { kind: 'group', name: 'Board' }, due: '2026-11-11' })])?.kicker).toBe('Due tomorrow · the board');
  });

  it('is empty when every step is done or the checklist did not load', () => {
    expect(grantsNews(TODAY, [], 0, [step({ done: true })])).toBeNull();
    expect(grantsNews(TODAY, [], 0, null)).toBeNull();
  });
});

describe('mapping', () => {
  it('keeps only known stages and orders by deadline (undated last), then added, then id', () => {
    const rows = [
      { id: 'c', name: 'C', stage: 'writing', deadline_on: null, created_at: '2026-01-01' },
      { id: 'b', name: 'B', stage: 'researching', deadline_on: null, created_at: '2026-01-01' },
      { id: 'a', name: 'A', stage: 'submitted', deadline_on: '2026-12-01', created_at: '2026-05-01' },
      { id: 'x', name: 'X', stage: 'archived', deadline_on: '2026-01-01', created_at: '2026-01-01' },
      { id: 'd', name: 'D', stage: 'decided', outcome: 'won', deadline_on: null, created_at: '2025-12-01', owner_id: 'u-me', amount_cents: 250000, amount_is_up_to: true },
    ];
    const out = mapGrants(rows, PEOPLE, 'u-me');
    expect(out.map((g) => g.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(out[1]).toMatchObject({ outcome: 'won', amountCents: 250000, upTo: true, owner: { name: 'Dana Mercer', me: true } });
    expect(stageCounts(out)).toEqual({ researching: 1, writing: 1, submitted: 1, decided: 1 });
    expect(realCount(stageCounts(out))).toBe(3);
  });

  it('maps steps in position order; first assignee by id, else the group, else nobody', () => {
    const tasks = [
      { id: 't2', title: 'Two', note: 'List', position: 2, status: 'open', due_on: '2026-11-16' },
      { id: 't1', title: 'One', note: 'Decision', position: 1, status: 'done', assignee_group: 'board' },
      { id: 't3', title: 'Three', position: 3, status: 'open' },
    ];
    const assignees = [
      { task_id: 't2', user_id: 'u-me' },
      { task_id: 't2', user_id: 'u-kd' },
    ];
    const out = mapSteps(tasks, assignees, PEOPLE, 'u-me');
    expect(out.map((s) => s.id)).toEqual(['t1', 't2', 't3']);
    expect(out[0]).toMatchObject({ done: true, kind: 'Decision', who: { kind: 'group', name: 'Board' } });
    expect(out[1]).toMatchObject({ due: '2026-11-16', who: { kind: 'person', name: 'Keith Dawson', me: false } });
    expect(out[2].who).toBeNull();
  });
});

describe('add a grant parser', () => {
  it('reads the name, the amount and "up to"', () => {
    expect(parseGrant('community foundation grant up to $5,000')).toEqual({ name: 'Community foundation grant', amountCents: 500_000, upTo: true });
    expect(parseGrant('STEM fund 1200.50')).toEqual({ name: 'STEM fund', amountCents: 120_050, upTo: false });
    expect(parseGrant('Local fund')).toEqual({ name: 'Local fund', amountCents: null, upTo: false });
    expect(parseGrant('  $300 ').name).toBe('');
  });
});

describe('paging helpers', () => {
  it('reads every page until an empty one', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const calls: [number, number][] = [];
    const out = await pageAll(async (from, to) => {
      calls.push([from, to]);
      return rows.slice(from, to + 1);
    });
    expect(out).toHaveLength(2345);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2345, 3344],
    ]);
  });

  it('throws past the ceiling instead of returning part of the list', async () => {
    await expect(pageAll(async (from) => [from], 1, 3)).rejects.toThrow(/refusing a partial list/);
  });

  it('chunks ids by 100', () => {
    const parts = chunk(Array.from({ length: 250 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });

  it('writes nothing live', () => {
    expect(Object.values(LIVE_CAPS).every((v) => v === false)).toBe(true);
  });
});

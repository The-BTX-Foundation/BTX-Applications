// lib/interview-replacement-options.ts: the Change sheet's list (who can cover, free first, the rest with a note), the
// free-hours row a pick not marked free gets, and the line shown above Save.
import { describe, expect, it } from 'vitest';
import { bothNote, coverRange, limitNote, needsRange, NOT_FREE_NOTE, oneRowCovers, pickWarning, replacementOptions, timeRangeWords, type OptionsInput } from '@/lib/interview-replacement-options';

// 5:00 to 5:30 PM Eastern on Nov 20 (EST, UTC-5).
const START = '2026-11-20T22:00:00.000Z';
const END = '2026-11-20T22:30:00.000Z';
const evening = { day: '2026-11-20', startMin: 1020, endMin: 1260 };
const cand = (userId: string, name: string, n = 0, free = 60) => ({ userId, name, interviewsSoFar: n, freeMinutesLeft: free });
const staff = (userId: string, name: string, role = 'board', initials: string | null = null) => ({ userId, name, initials, role });

const base = (over: Partial<OptionsInput> = {}): OptionsInput => ({
  staff: [staff('a', 'Ada Lee'), staff('b', 'Bo Kim'), staff('c', 'Cy Day', 'admin'), staff('d', 'Di Fox'), staff('e', 'Eve Ray'), staff('f', 'Fay Lo'), staff('x', 'Xu Applicant', 'applicant')],
  pair: ['a', 'b'],
  candidates: [],
  conflicted: [],
  held: [],
  ranges: new Map(),
  limits: new Map(),
  startsAt: START,
  endsAt: END,
  ...over,
});

describe('replacementOptions', () => {
  it('free people first in least-loaded order, then the rest by name with a note', () => {
    const out = replacementOptions(
      base({
        candidates: [cand('e', 'Eve Ray', 2), cand('c', 'Cy Day', 0), cand('a', 'Ada Lee', 0)],
        ranges: new Map([['f', [evening]], ['c', [evening]], ['e', [evening]]]),
        limits: new Map([['f', 2]]),
        held: [
          { userId: 'f', startsAt: '2026-11-18T22:00:00.000Z', endsAt: '2026-11-18T22:30:00.000Z' },
          { userId: 'f', startsAt: '2026-11-19T22:00:00.000Z', endsAt: '2026-11-19T22:30:00.000Z' },
        ],
      }),
    );
    expect(out).toEqual([
      { id: 'c', name: 'Cy Day', initials: 'CD', free: true, note: null },
      { id: 'e', name: 'Eve Ray', initials: 'ER', free: true, note: null },
      { id: 'd', name: 'Di Fox', initials: 'DF', free: false, note: NOT_FREE_NOTE },
      { id: 'f', name: 'Fay Lo', initials: 'FL', free: false, note: 'At their limit of 2' },
    ]);
  });
  it('leaves out the pair, people who know the student, people on an overlapping interview and non-staff', () => {
    const out = replacementOptions(
      base({
        conflicted: ['d'],
        held: [{ userId: 'e', startsAt: '2026-11-20T22:15:00.000Z', endsAt: '2026-11-20T22:45:00.000Z' }],
        candidates: [cand('d', 'Di Fox'), cand('e', 'Eve Ray')],
      }),
    );
    expect(out.map((o) => o.id)).toEqual(['c', 'f']);
  });
  it('an interview that only touches this one (ends as it starts) is not a clash', () => {
    const out = replacementOptions(base({ held: [{ userId: 'f', startsAt: '2026-11-20T21:30:00.000Z', endsAt: START }] }));
    expect(out.map((o) => o.id)).toContain('f');
  });
  it('free hours that cover only part of the time are "Not marked free then", even under the limit', () => {
    const out = replacementOptions(base({ endsAt: '2026-11-20T23:00:00.000Z', ranges: new Map([['f', [{ day: '2026-11-20', startMin: 1020, endMin: 1050 }]]]) }));
    expect(out.find((o) => o.id === 'f')).toMatchObject({ free: false, note: NOT_FREE_NOTE });
  });
  it('rows are not joined: 4 to 5 PM and 5 to 6 PM leave 4:30 to 5:30 PM "Not marked free then"', () => {
    const rows = [{ day: '2026-11-20', startMin: 960, endMin: 1020 }, { day: '2026-11-20', startMin: 1020, endMin: 1080 }];
    const out = replacementOptions(base({ startsAt: '2026-11-20T21:30:00.000Z', endsAt: '2026-11-20T22:30:00.000Z', ranges: new Map([['f', rows]]) }));
    expect(out.find((o) => o.id === 'f')).toMatchObject({ free: false, note: NOT_FREE_NOTE });
  });
  it('not free and at their limit: both in one note', () => {
    const out = replacementOptions(base({ limits: new Map([['f', 0]]) }));
    expect(out.find((o) => o.id === 'f')).toMatchObject({ free: false, note: 'Not marked free then · at their limit of 0' });
  });
  it('never free:false with no note: an unexplained miss is "Not marked free then"', () => {
    const out = replacementOptions(base({ ranges: new Map([['f', [evening]]]) }));
    expect(out.find((o) => o.id === 'f')).toMatchObject({ free: false, note: NOT_FREE_NOTE });
    expect(out.every((o) => o.free || o.note)).toBe(true);
  });
  it('uses the staff name and initials when given; nobody else left gives an empty list', () => {
    const out = replacementOptions(base({ staff: [staff('c', 'Cy Day', 'admin', 'CYD')], candidates: [cand('c', 'Old Name')] }));
    expect(out).toEqual([{ id: 'c', name: 'Cy Day', initials: 'CYD', free: true, note: null }]);
    expect(replacementOptions(base({ staff: [staff('a', 'Ada Lee'), staff('b', 'Bo Kim')] }))).toEqual([]);
  });
});

describe('oneRowCovers / needsRange', () => {
  it('one row must cover the whole time', () => {
    expect(oneRowCovers([evening], START, END)).toBe(true);
    expect(oneRowCovers([{ day: '2026-11-20', startMin: 960, endMin: 1020 }, { day: '2026-11-20', startMin: 1020, endMin: 1080 }], '2026-11-20T21:30:00.000Z', '2026-11-20T22:30:00.000Z')).toBe(false);
    expect(oneRowCovers([{ ...evening, day: '2026-11-21' }], START, END)).toBe(false);
  });
  it('a range is added for anyone not free, unless the only reason is their limit', () => {
    expect(needsRange({ free: true, note: null })).toBe(false);
    expect(needsRange({ free: false, note: NOT_FREE_NOTE })).toBe(true);
    expect(needsRange({ free: false, note: bothNote(2) })).toBe(true);
    expect(needsRange({ free: false, note: limitNote(2) })).toBe(false);
    expect(needsRange({ free: false, note: null })).toBe(true);
  });
});

describe('coverRange', () => {
  it('the Eastern day and the half hours around the interview', () => {
    expect(coverRange(START, END)).toEqual({ day: '2026-11-20', startMin: 1020, endMin: 1050 });
    expect(coverRange('2026-11-20T22:10:00.000Z', '2026-11-20T22:40:00.000Z')).toEqual({ day: '2026-11-20', startMin: 1020, endMin: 1080 });
  });
  it('never past midnight', () => {
    expect(coverRange('2026-11-21T04:45:00.000Z', '2026-11-21T05:15:00.000Z')).toEqual({ day: '2026-11-20', startMin: 1410, endMin: 1440 });
  });
});

describe('words', () => {
  it('time range: one AM/PM when both halves match', () => {
    expect(timeRangeWords('5:00 PM', '5:30 PM')).toBe('5:00 to 5:30 PM');
    expect(timeRangeWords('11:30 AM', '12:00 PM')).toBe('11:30 AM to 12:00 PM');
  });
  it('the line above Save', () => {
    expect(pickWarning({ name: 'Cy Day', free: true, note: null }, '5:00 to 5:30 PM')).toBeNull();
    expect(pickWarning({ name: 'Di Fox', free: false, note: NOT_FREE_NOTE }, '5:00 to 5:30 PM')).toBe('Only pick Di if they agreed. Saving adds 5:00 to 5:30 PM to their free hours.');
    expect(pickWarning({ name: 'Fay Lo', free: false, note: limitNote(2) }, '5:00 to 5:30 PM')).toBe('Only pick Fay if they agreed. This puts them over their limit.');
    expect(pickWarning({ name: 'Di Fox', free: false, note: bothNote(2) }, '5:00 to 5:30 PM')).toBe('Only pick Di if they agreed. Saving adds 5:00 to 5:30 PM to their free hours and puts them over their limit.');
    expect(pickWarning({ name: 'Di Fox', free: false, note: NOT_FREE_NOTE }, null)).toBe('Only pick Di if they agreed. Saving adds the interview time to their free hours.');
  });
});

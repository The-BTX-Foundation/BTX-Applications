import { describe, expect, it } from 'vitest';
import { encodeRanges, freeWindow, mergeFreeRanges, parseRanges, slotsFitRanges, spanLabel } from '../lib/journey';

// 2026-11-10 is a Tuesday; November is Eastern standard time (UTC-5): 6 PM Eastern = 23:00Z.
const slot = (id: string, startsAt: string, endsAt: string) => ({ id, startsAt, endsAt });

describe('slotsFitRanges', () => {
  const slots = [
    slot('a', '2026-11-10T23:00:00Z', '2026-11-10T23:30:00Z'), // Tue 6:00 PM
    slot('b', '2026-11-10T21:30:00Z', '2026-11-10T22:00:00Z'), // Tue 4:30 PM
    slot('c', '2026-11-11T01:30:00Z', '2026-11-11T02:00:00Z'), // Tue 8:30 PM
    slot('d', '2026-11-11T02:30:00Z', '2026-11-11T03:00:00Z'), // Tue 9:30 PM (past the end of a 6 to 9:30 range)
  ];
  it('keeps the slots that sit inside a range on the same Eastern day', () => {
    const fit = slotsFitRanges(slots, [{ day: '2026-11-10', start: '18:00', end: '21:30' }]);
    expect(fit.map((s) => s.id)).toEqual(['a', 'c']);
  });
  it('fits nothing with no ranges or another day', () => {
    expect(slotsFitRanges(slots, [])).toEqual([]);
    expect(slotsFitRanges(slots, [{ day: '2026-11-11', start: '08:00', end: '22:00' }])).toEqual([]);
  });
  it('a slot may end exactly where the range ends', () => {
    expect(slotsFitRanges(slots, [{ day: '2026-11-10', start: '20:00', end: '24:00' }]).map((s) => s.id)).toEqual(['c', 'd']);
  });
});

describe('mergeFreeRanges', () => {
  it('sorts, and joins overlapping and touching ranges per day', () => {
    expect(
      mergeFreeRanges([
        { day: '2026-11-12', start: '09:00', end: '10:00' },
        { day: '2026-11-10', start: '18:00', end: '19:00' },
        { day: '2026-11-10', start: '19:00', end: '21:00' },
        { day: '2026-11-10', start: '20:00', end: '20:30' },
      ]),
    ).toEqual([
      { day: '2026-11-10', start: '18:00', end: '21:00' },
      { day: '2026-11-12', start: '09:00', end: '10:00' },
    ]);
  });
});

describe('spanLabel and link encoding', () => {
  it('labels ranges the way the chips show them', () => {
    expect(spanLabel({ day: 'x', start: '18:00', end: '21:00' })).toBe('6 to 9 PM');
    expect(spanLabel({ day: 'x', start: '11:00', end: '12:30' })).toBe('11 AM to 12:30 PM');
    expect(spanLabel({ day: 'x', start: '20:00', end: '24:00' })).toBe('8 PM to 12 AM');
  });
  it('round-trips ranges through a link and drops junk', () => {
    const rs = [{ day: '2026-11-10', start: '18:00', end: '21:00' }];
    expect(parseRanges(encodeRanges(rs))).toEqual(rs);
    expect(parseRanges('nope,2026-11-10_18:00-21:00')).toEqual(rs);
    expect(parseRanges(undefined)).toEqual([]);
  });
});

describe('freeWindow', () => {
  it('starts today or on the first interview day, and never ends before it starts', () => {
    expect(freeWindow('2026-11-02', '2026-11-09', '2026-11-20')).toEqual({ start: '2026-11-09', end: '2026-11-20' });
    expect(freeWindow('2026-11-12', '2026-11-09', '2026-11-20')).toEqual({ start: '2026-11-12', end: '2026-11-20' });
    expect(freeWindow('2026-11-25', '2026-11-09', '2026-11-20')).toEqual({ start: '2026-11-25', end: '2026-12-08' });
    expect(freeWindow('2026-11-02', null, null)).toEqual({ start: '2026-11-02', end: '2026-11-15' });
  });
});

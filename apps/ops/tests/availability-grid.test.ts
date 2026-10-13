import { describe, expect, it } from 'vitest';
import { GRID_ROWS, addTime, clockShort, isFree, parseLimit, quickPickRanges, rangeText, removeTime, setCell, totalsPlain, totalsText } from '@/lib/availability-grid';
import type { MinuteRange } from '@/lib/free-ranges';

const D = '2026-11-11'; // a Wednesday
const evening: MinuteRange = { day: D, startMin: 17 * 60, endMin: 21 * 60 };

describe('grid rows', () => {
  it('runs every half hour from 8:00 AM to 9:30 PM (ending 10:00 PM)', () => {
    expect(GRID_ROWS).toHaveLength(28);
    expect(GRID_ROWS[0]).toBe(480);
    expect(GRID_ROWS[27]).toBe(1290);
  });
});

describe('labels', () => {
  it('writes clock times and ranges', () => {
    expect(clockShort(1020)).toBe('5 PM');
    expect(clockShort(1050)).toBe('5:30 PM');
    expect(clockShort(1440)).toBe('12 AM');
    expect(rangeText(1020, 1260)).toBe('5 to 9 PM');
    expect(rangeText(600, 840)).toBe('10 AM to 2 PM');
  });
  it('writes the totals', () => {
    expect(totalsText([])).toBe('Nothing picked yet');
    expect(totalsText([evening, { day: '2026-11-14', startMin: 600, endMin: 840 }])).toBe('Free 8 hours across 2 days');
    expect(totalsText([{ day: D, startMin: 600, endMin: 630 }])).toBe('Free 0.5 hours across 1 day');
    expect(totalsPlain([evening])).toBe('4 hours across 1 day');
  });
});

describe('editing the times', () => {
  it('a click toggles one half hour and neighbours merge', () => {
    let r = setCell([], D, 600, true);
    expect(isFree(r, D, 600)).toBe(true);
    r = setCell(r, D, 630, true);
    expect(r).toEqual([{ day: D, startMin: 600, endMin: 660 }]);
    r = setCell(r, D, 600, false);
    expect(r).toEqual([{ day: D, startMin: 630, endMin: 660 }]);
  });
  it('erasing the middle splits a range', () => {
    expect(removeTime([evening], D, 18 * 60, 19 * 60)).toEqual([
      { day: D, startMin: 1020, endMin: 1080 },
      { day: D, startMin: 1140, endMin: 1260 },
    ]);
  });
  it('adding keeps other days and merges overlaps', () => {
    const r = addTime([evening, { day: '2026-11-12', startMin: 600, endMin: 660 }], D, 20 * 60, 22 * 60);
    expect(r).toEqual([{ day: D, startMin: 1020, endMin: 1320 }, { day: '2026-11-12', startMin: 600, endMin: 660 }]);
  });
});

describe('quick picks', () => {
  const days = ['2026-11-13', '2026-11-14', '2026-11-15'];
  it('weekday evenings skip weekends', () => {
    expect(quickPickRanges('weekday-evenings', days)).toEqual([{ day: '2026-11-13', startMin: 1020, endMin: 1260 }]);
  });
  it('weekends keep only Saturday and Sunday', () => {
    expect(quickPickRanges('weekends', days).map((r) => r.day)).toEqual(['2026-11-14', '2026-11-15']);
  });
  it('every day covers all days', () => {
    expect(quickPickRanges('every-day', days)).toHaveLength(3);
  });
});

describe('parseLimit', () => {
  it('reads blank as no limit and 1 to 50 as a number', () => {
    expect(parseLimit('')).toBeNull();
    expect(parseLimit(' 4 ')).toBe(4);
    expect(parseLimit('50')).toBe(50);
    expect(parseLimit('0')).toBeUndefined();
    expect(parseLimit('51')).toBeUndefined();
    expect(parseLimit('two')).toBeUndefined();
  });
});

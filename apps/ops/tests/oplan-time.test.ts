// The Outreach Plan page's date words (lib/oplan-time.ts): the header date, the row dates, the month line's positions and
// week labels.
import { describe, expect, it } from 'vitest';
import { daysIn, headerDate, linePos, monthLong, nextMonthKey, pnRel, weekMarks } from '@/lib/oplan-time';

const T = '2026-11-10';

describe('oplan-time', () => {
  it('draws the header date', () => {
    expect(headerDate(T)).toBe('Tue, Nov 10');
  });

  it('says past days as dates and the rest relative', () => {
    expect(pnRel(T, '2026-11-02')).toMatch(/Nov 2$/);
    expect(pnRel(T, T)).toBe('Today');
    expect(pnRel(T, '2026-11-11')).toBe('Tomorrow');
    expect(pnRel(T, null)).toBe('No date');
  });

  it('rolls the month over the year end', () => {
    expect(nextMonthKey('2026-11')).toBe('2026-12');
    expect(nextMonthKey('2026-12')).toBe('2027-01');
    expect(monthLong('2026-12')).toBe('December');
    expect(daysIn('2026-02')).toBe(28);
  });

  it('places days on the line from 0 to 100', () => {
    expect(linePos('2026-11', 1)).toBe(0);
    expect(linePos('2026-11', 30)).toBe(100);
    expect(linePos('2026-11', 10)).toBeCloseTo((9 / 29) * 100);
  });

  it('labels the first day, the Mondays clear of the edges and the last day', () => {
    const marks = weekMarks('2026-11');
    expect(marks.map((m) => m.day)).toEqual([1, 9, 16, 23, 30]);
    expect(marks[0].edge).toBe('l');
    expect(marks[marks.length - 1].edge).toBe('r');
    expect(marks[1].edge).toBeNull();
  });
});

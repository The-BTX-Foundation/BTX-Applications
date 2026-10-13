import { describe, expect, it } from 'vitest';
import { describeRanges, normalizeRanges } from '../src/index';

const win = { windowStart: '2026-11-10', windowEnd: '2026-11-20' };
const r = (day: string, start: string, end: string) => ({ day, start, end });

describe('normalizeRanges', () => {
  it('rounds start down and end up to the half hour', () => {
    expect(normalizeRanges([r('2026-11-10', '17:10', '19:40')], win)).toEqual([r('2026-11-10', '17:00', '20:00')]);
  });

  it('never shrinks a short range to nothing', () => {
    expect(normalizeRanges([r('2026-11-10', '17:10', '17:20')], win)).toEqual([r('2026-11-10', '17:00', '17:30')]);
  });

  it('drops a range whose end is not after its start', () => {
    expect(normalizeRanges([r('2026-11-10', '17:00', '17:00'), r('2026-11-10', '19:00', '18:00')], win)).toEqual([]);
  });

  it('clips to the default day bounds of 08:00 to 22:00', () => {
    expect(normalizeRanges([r('2026-11-10', '06:00', '09:00'), r('2026-11-11', '21:00', '23:30')], win)).toEqual([
      r('2026-11-10', '08:00', '09:00'),
      r('2026-11-11', '21:00', '22:00'),
    ]);
  });

  it('drops ranges that sit wholly outside the day bounds', () => {
    expect(normalizeRanges([r('2026-11-10', '05:00', '07:00'), r('2026-11-10', '22:30', '23:30')], win)).toEqual([]);
  });

  it('honours custom day bounds', () => {
    expect(normalizeRanges([r('2026-11-10', '08:00', '20:00')], { ...win, dayStart: '10:00', dayEnd: '18:00' })).toEqual([
      r('2026-11-10', '10:00', '18:00'),
    ]);
  });

  it('merges overlapping and touching ranges and sorts', () => {
    const out = normalizeRanges(
      [r('2026-11-12', '18:00', '20:00'), r('2026-11-10', '17:00', '19:00'), r('2026-11-10', '18:00', '21:00'), r('2026-11-10', '21:00', '22:00'), r('2026-11-10', '09:00', '10:00')],
      win,
    );
    expect(out).toEqual([r('2026-11-10', '09:00', '10:00'), r('2026-11-10', '17:00', '22:00'), r('2026-11-12', '18:00', '20:00')]);
  });

  it('keeps ranges that merely sit side by side with a gap', () => {
    expect(normalizeRanges([r('2026-11-10', '09:00', '10:00'), r('2026-11-10', '10:30', '11:00')], win)).toHaveLength(2);
  });

  it('drops days outside the window, including the day before and after', () => {
    expect(
      normalizeRanges([r('2026-11-09', '17:00', '19:00'), r('2026-11-21', '17:00', '19:00'), r('2026-11-20', '17:00', '19:00')], win),
    ).toEqual([r('2026-11-20', '17:00', '19:00')]);
  });

  it('drops malformed entries without throwing', () => {
    const bad = [
      null,
      undefined,
      'x',
      {},
      r('2026-02-31', '17:00', '19:00'),
      r('11/10/2026', '17:00', '19:00'),
      r('2026-11-10', '25:00', '26:00'),
      r('2026-11-10', '5pm', '7pm'),
      { day: '2026-11-10', start: 1700, end: 1900 },
      r('2026-11-10', '17:00', '19:00'),
    ] as never;
    expect(normalizeRanges(bad, win)).toEqual([r('2026-11-10', '17:00', '19:00')]);
  });

  it('returns nothing for non-array input or a bad window', () => {
    expect(normalizeRanges('nope' as never, win)).toEqual([]);
    expect(normalizeRanges([r('2026-11-10', '17:00', '19:00')], { windowStart: 'x', windowEnd: 'y' })).toEqual([]);
  });
});

describe('describeRanges', () => {
  it('gives one line per day with 12-hour times', () => {
    expect(
      describeRanges([r('2026-11-10', '17:00', '21:00'), r('2026-11-14', '08:00', '12:00'), r('2026-11-15', '11:30', '13:00')]),
    ).toEqual(['Tue Nov 10: 5:00 to 9:00 PM', 'Sat Nov 14: 8:00 AM to 12:00 PM', 'Sun Nov 15: 11:30 AM to 1:00 PM']);
  });

  it('puts several ranges for one day on one line', () => {
    expect(describeRanges([r('2026-11-10', '09:00', '10:00'), r('2026-11-10', '17:00', '21:00')])).toEqual([
      'Tue Nov 10: 9:00 to 10:00 AM, 5:00 to 9:00 PM',
    ]);
  });

  it('returns an empty list for no ranges', () => {
    expect(describeRanges([])).toEqual([]);
  });
});

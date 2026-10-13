import { describe, expect, it } from 'vitest';
import { freeCountAt, proposalCount, proposeTimes, type FreeRangeRow } from '@/lib/propose-times';

// Oct 2026 is Eastern daylight time (UTC-4): 10:00 AM ET = 14:00Z.
const D1 = '2026-10-15';
const D2 = '2026-10-16';
const NOW = new Date('2026-10-01T00:00:00Z');
const r = (userId: string, day: string, startMin: number, endMin: number): FreeRangeRow => ({ userId, day, startMin, endMin });

describe('freeCountAt', () => {
  it('counts people free for the whole time, once each', () => {
    const ranges = [r('a', D1, 540, 660), r('a', D1, 600, 720), r('b', D1, 600, 630), r('c', D1, 615, 700)];
    expect(freeCountAt(ranges, D1, 600, 630)).toBe(2); // c starts at 10:15
    expect(freeCountAt(ranges, D1, 630, 660)).toBe(2); // a and c
    expect(freeCountAt(ranges, D2, 600, 630)).toBe(0);
  });
});

describe('proposalCount', () => {
  it('is about 1.3 per applicant, at least 1', () => {
    expect(proposalCount(10)).toBe(13);
    expect(proposalCount(3)).toBe(4);
    expect(proposalCount(0)).toBe(1);
  });
});

describe('proposeTimes', () => {
  const base = { windowStart: D1, windowEnd: D2, existing: [], now: NOW };

  it('proposes only times where 2 or more people are free, as UTC instants', () => {
    const out = proposeTimes({ ...base, applicants: 10, ranges: [r('a', D1, 600, 690), r('b', D1, 630, 720), r('c', D2, 600, 720)] });
    // Only 10:30-11:30 on day 1 has two people.
    expect(out.map((t) => [t.day, t.time, t.freeCount])).toEqual([
      [D1, '10:30', 2],
      [D1, '11:00', 2],
    ]);
    expect(out[0].startsAt).toBe('2026-10-15T14:30:00.000Z');
    expect(out[0].endsAt).toBe('2026-10-15T15:00:00.000Z');
  });

  it('spreads across days in turn and prefers times with more people free, then earlier', () => {
    const ranges = [r('a', D1, 540, 720), r('b', D1, 540, 720), r('c', D1, 660, 720), r('a', D2, 540, 600), r('b', D2, 540, 600)];
    const out = proposeTimes({ ...base, applicants: 2, ranges }); // ceil(2.6) = 3
    expect(out.map((t) => `${t.day} ${t.time} ${t.freeCount}`)).toEqual([`${D1} 11:00 3`, `${D1} 11:30 3`, `${D2} 09:00 2`]);
  });

  it('proposes at least one when any time qualifies', () => {
    expect(proposeTimes({ ...base, applicants: 0, ranges: [r('a', D1, 540, 600), r('b', D1, 540, 600)] })).toHaveLength(1);
    expect(proposeTimes({ ...base, applicants: 5, ranges: [r('a', D1, 540, 600)] })).toEqual([]);
  });

  it('skips times that exist or overlap one, and times in the past', () => {
    const ranges = [r('a', D1, 540, 660), r('b', D1, 540, 660)];
    const out = proposeTimes({ ...base, applicants: 10, ranges, existing: [{ startsAt: '2026-10-15T13:00:00.000Z' }, { startsAt: '2026-10-15T14:15:00.000Z' }] });
    // 9:00 exists; 10:15 blocks 10:00 and 10:30; 9:30 is left.
    expect(out.map((t) => t.time)).toEqual(['09:30']);
    const late = proposeTimes({ ...base, applicants: 10, ranges, now: new Date('2026-10-15T14:00:00.000Z') });
    expect(late.map((t) => t.time)).toEqual(['10:30']);
  });

  it('ignores ranges outside the window and needs the window dates', () => {
    expect(proposeTimes({ ...base, applicants: 3, ranges: [r('a', '2026-10-20', 540, 600), r('b', '2026-10-20', 540, 600)] })).toEqual([]);
    expect(proposeTimes({ ...base, windowStart: null, applicants: 3, ranges: [r('a', D1, 540, 600), r('b', D1, 540, 600)] })).toEqual([]);
  });
});

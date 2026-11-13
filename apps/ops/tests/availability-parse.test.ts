// The "Add free time" line reader on the refreshed Your availability page (lib/availability-parse.ts): days, hours and
// the plain error words, over the cycle's interview window (Tue Nov 10 to Fri Nov 20, 2026; today Tue Nov 10).
import { describe, expect, it } from 'vitest';
import { parseAvail } from '@/lib/availability-parse';
import { windowDays } from '@/lib/free-ranges';

const win = { days: windowDays('2026-11-10', '2026-11-20'), today: '2026-11-10' };

describe('parseAvail', () => {
  it('reads "sat 10 to 2" as Saturday 10 AM to 2 PM', () => {
    const p = parseAvail('sat 10 to 2', win);
    expect(p.days).toEqual(['2026-11-14']);
    expect([p.s, p.e]).toEqual([600, 840]);
  });
  it('reads a weekday name and evening hours', () => {
    const p = parseAvail('wed 5 to 9 pm', win);
    expect(p.days[0]).toBe('2026-11-11');
    expect([p.s, p.e]).toEqual([1020, 1260]);
  });
  it('a fixed day (editing one row) ignores the days in the words', () => {
    const p = parseAvail('6 to 8 pm', win, '2026-11-16');
    expect(p.days).toEqual(['2026-11-16']);
    expect([p.s, p.e]).toEqual([1080, 1200]);
  });
  it('finds nothing in words with no day and no hours', () => {
    const p = parseAvail('whenever works for the team', win);
    expect(p.days).toEqual([]);
    expect(p.s).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { addDays, clock, daysFrom, daysToSunday, dueTitle, fullDate, groupOf, rel, shortDate, snoozeDays } from '@/lib/refresh-time';

// The shared time words every refreshed page uses. The demo's day: Tuesday, November 10, 2026.
const T = '2026-11-10';

describe('rel (the due word on a row)', () => {
  it('says late, today, tomorrow, the weekday, next weekday, then the short date', () => {
    expect(rel(T, '2026-11-09')).toBe('1 day late');
    expect(rel(T, '2026-11-07')).toBe('3 days late');
    expect(rel(T, T)).toBe('Today');
    expect(rel(T, '2026-11-11')).toBe('Tomorrow');
    expect(rel(T, '2026-11-12')).toBe('Thu');
    expect(rel(T, '2026-11-15')).toBe('Sun');
    expect(rel(T, '2026-11-16')).toBe('Next Mon');
    expect(rel(T, '2026-11-22')).toBe('Next Sun');
    expect(rel(T, '2026-11-23')).toBe('Mon Nov 23');
    expect(rel(T, null)).toBe('No date');
  });
});

describe('groupOf', () => {
  it('puts tasks in late / this week / next week / later / waiting', () => {
    expect(groupOf(T, '2026-11-09')).toBe('late');
    expect(groupOf(T, T)).toBe('week');
    expect(groupOf(T, '2026-11-15')).toBe('week');
    expect(groupOf(T, '2026-11-16')).toBe('next');
    expect(groupOf(T, '2026-11-22')).toBe('next');
    expect(groupOf(T, '2026-11-23')).toBe('later');
    expect(groupOf(T, null)).toBe('later');
    expect(groupOf(T, '2026-11-09', true)).toBe('wait');
  });
});

describe('dates across month and year edges', () => {
  it('counts days over a month end and a year end', () => {
    expect(daysFrom('2026-11-30', '2026-12-01')).toBe(1);
    expect(daysFrom('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysFrom('2027-01-01', '2026-12-30')).toBe(-2);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(rel('2026-12-31', '2027-01-01')).toBe('Tomorrow');
    expect(rel('2026-12-28', '2027-01-15')).toBe('Fri Jan 15');
  });
  it('writes short and full dates', () => {
    expect(shortDate('2026-11-12')).toBe('Thu Nov 12');
    expect(fullDate('2026-11-12')).toBe('Thursday, November 12');
    expect(dueTitle(T, '2026-11-09')).toBe('Was due Monday, November 9');
    expect(dueTitle(T, '2026-11-12')).toBe('Due Thursday, November 12');
    expect(dueTitle(T, null)).toBe('No due date');
  });
});

describe('snoozeDays', () => {
  it('gives tomorrow and the next Monday', () => {
    expect(snoozeDays(T)).toEqual({ tomorrow: '2026-11-11', nextMonday: '2026-11-16' });
    expect(snoozeDays('2026-11-16').nextMonday).toBe('2026-11-23');
    expect(snoozeDays('2026-12-30').nextMonday).toBe('2027-01-04');
  });
});

describe('clock (Eastern)', () => {
  it('reads an instant as Eastern time', () => {
    expect(clock('2026-11-10T14:14:00Z')).toBe('9:14 AM');
    expect(clock('2026-11-10T17:05:00Z')).toBe('12:05 PM');
  });
});

describe('calendar weeks (Mon to Sun) for every weekday as today', () => {
  // Mon Nov 9 .. Sun Nov 15, 2026, plus month and year edges.
  const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-30', '2026-12-27', '2026-12-31', '2027-01-03'];
  it.each(days)('today %s: this week ends Sunday, next week is Mon to Sun, snooze "Next week" lands in it', (t) => {
    const toSun = daysToSunday(t);
    const sunday = addDays(t, toSun);
    expect(new Date(sunday + 'T00:00:00Z').getUTCDay()).toBe(0);
    expect(groupOf(t, t)).toBe('week');
    expect(groupOf(t, sunday)).toBe('week');
    expect(groupOf(t, addDays(sunday, 1))).toBe('next');
    expect(groupOf(t, addDays(sunday, 7))).toBe('next');
    expect(groupOf(t, addDays(sunday, 8))).toBe('later');
    expect(groupOf(t, addDays(t, -1))).toBe('late');
    const { nextMonday, tomorrow } = snoozeDays(t);
    expect(nextMonday).toBe(addDays(sunday, 1));
    expect(groupOf(t, nextMonday)).toBe('next');
    expect(tomorrow).toBe(addDays(t, 1));
    expect(rel(t, nextMonday)).toBe(toSun === 0 ? 'Tomorrow' : 'Next Mon');
  });
  it('Sunday: this week is today only; Monday starts next week', () => {
    expect(daysToSunday('2026-11-15')).toBe(0);
    expect(groupOf('2026-11-15', '2026-11-16')).toBe('next');
    expect(groupOf('2026-11-15', '2026-11-22')).toBe('next');
    expect(groupOf('2026-11-15', '2026-11-23')).toBe('later');
  });
  it('Wednesday: the next Monday is next week, not this week', () => {
    expect(groupOf('2026-11-11', '2026-11-16')).toBe('next');
    expect(rel('2026-11-11', '2026-11-16')).toBe('Next Mon');
  });
  it('year edge: Thu Dec 31 2026 -> next week is Mon Jan 4 to Sun Jan 10 2027', () => {
    expect(snoozeDays('2026-12-31').nextMonday).toBe('2027-01-04');
    expect(groupOf('2026-12-31', '2027-01-03')).toBe('week');
    expect(groupOf('2026-12-31', '2027-01-10')).toBe('next');
    expect(groupOf('2026-12-31', '2027-01-11')).toBe('later');
  });
});

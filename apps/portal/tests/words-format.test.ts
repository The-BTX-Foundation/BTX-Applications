import { describe, expect, it } from 'vitest';
import { ESSAY_WORD_LIMIT, countWords } from '@/lib/words';
import { daysBetween, easternDate, easternTime, formatMoney, longDay, savedTime, shortDay } from '@/lib/format';

describe('word count', () => {
  it('counts runs of characters between spaces and line breaks', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords('one')).toBe(1);
    expect(countWords(' one  two\nthree\n\nfour ')).toBe(4);
  });
  it('knows the limit', () => {
    expect(ESSAY_WORD_LIMIT).toBe(500);
    expect(countWords(Array(501).fill('w').join(' '))).toBeGreaterThan(ESSAY_WORD_LIMIT);
  });
});

describe('Eastern-time formatting', () => {
  it('uses the Eastern calendar date, across the midnight boundary', () => {
    expect(easternDate('2026-09-14T03:30:00Z')).toBe('2026-09-13'); // 11:30 PM Sep 13 in New York
    expect(easternDate('2026-09-14T04:00:00Z')).toBe('2026-09-14');
  });
  it('handles standard time after the clocks change', () => {
    expect(easternTime('2026-12-15T04:59:00Z')).toBe('11:59 PM');
    expect(easternTime('2026-09-15T03:59:00Z')).toBe('11:59 PM'); // daylight time, 4 hours behind
  });
  it('shows the saved time as an Eastern clock time', () => {
    expect(savedTime('2026-09-12T20:31:00Z')).toBe('4:31 PM');
  });
  it('writes dates the way the drafts do', () => {
    expect(longDay('2026-09-14')).toBe('Mon Sep 14');
    expect(shortDay('2026-10-09')).toBe('Oct 9');
    expect(daysBetween('2026-08-17', '2026-10-23')).toBe(67);
  });
  it('falls back to the bracketed placeholders for empty settings', () => {
    expect(longDay(null)).toBe('[date]');
    expect(easternTime(null)).toBe('[time]');
    expect(formatMoney(null)).toBe('[amount]');
    expect(formatMoney(200000)).toBe('$2,000');
    expect(formatMoney(250050)).toBe('$2,500.50');
  });
});

import { describe, expect, it } from 'vitest';
import { dayFromWord, daysFrom, dueWord, groupOf, parseTask, rel, rowActions, snoozeDays, ticketTime } from '@/lib/today-time';
import * as shared from '@/lib/refresh-time';

// Today's own time words (the shared ones are tested in refresh-time.test.ts). The demo's day: Tuesday, November 10, 2026.
const T = '2026-11-10';

describe('re-exports', () => {
  it('today-time hands out the shared helpers unchanged', () => {
    expect(rel).toBe(shared.rel);
    expect(groupOf).toBe(shared.groupOf);
    expect(snoozeDays).toBe(shared.snoozeDays);
  });
});

describe('the needs card due line', () => {
  it('the needs card says Due Thu', () => {
    expect(dueWord(T, '2026-11-12')).toBe('Due Thu');
    expect(dueWord(T, T)).toBe('Due today');
    expect(dueWord(T, '2026-11-11')).toBe('Due tomorrow');
    expect(dueWord(T, '2026-11-19')).toBe('Due Thu Nov 19');
    expect(dueWord(T, '2026-11-08')).toBe('2 days late');
  });
});

describe('ticket time (Eastern)', () => {
  it('reads the stub, time and distance in Eastern time', () => {
    // 22:30 UTC on Nov 12 is 5:30 PM Eastern (EST, UTC-5).
    expect(ticketTime(T, '2026-11-12T22:30:00Z')).toEqual({ wd: 'Thu', day: 12, mon: 'Nov', time: '5:30 PM', away: 'in 2 days', full: 'Thursday November 12' });
    expect(ticketTime(T, '2026-11-18T22:00:00Z').away).toBe('next Wed');
    // 03:00 UTC on Nov 11 is still Nov 10 in Eastern: today.
    expect(ticketTime(T, '2026-11-11T03:00:00Z').away).toBe('today');
    expect(ticketTime(T, '2026-11-11T15:00:00Z').away).toBe('tomorrow');
  });
});

describe('parseTask (add in place)', () => {
  it('reads a weekday and drops it from the title', () => {
    expect(parseTask(T, 'Call the venue fri')).toEqual({ title: 'Call the venue', dueOn: '2026-11-13', area: null });
  });
  it('reads tomorrow, next week and a same weekday as a week away', () => {
    expect(parseTask(T, 'email donors tomorrow').dueOn).toBe('2026-11-11');
    expect(parseTask(T, 'plan retreat next week').dueOn).toBe('2026-11-16');
    expect(parseTask(T, 'board call tue').dueOn).toBe('2026-11-17');
    expect(parseTask(T, 'file report by monday').title).toBe('File report');
  });
  it('reads an area and drops a trailing area word as a tag', () => {
    expect(parseTask(T, 'check the Q4 numbers budget')).toEqual({ title: 'Check the Q4 numbers', dueOn: null, area: 'Finance' });
    expect(parseTask(T, 'draft newsletter').area).toBe('Outreach');
    expect(parseTask(T, 'draft newsletter').title).toBe('Draft newsletter');
  });
  it('honors a dismissed chip', () => {
    expect(parseTask(T, 'Call the venue fri', { date: true, area: false })).toEqual({ title: 'Call the venue fri', dueOn: null, area: null });
    expect(parseTask(T, 'approve budget', { date: false, area: true }).area).toBeNull();
  });
});

describe('rowActions', () => {
  const caps = { done: true, snooze: true, approveInPlace: false };
  it('an approval gets no check and no snooze unless approveInPlace', () => {
    expect(rowActions({ kind: 'approval' }, caps)).toEqual({ done: false, snooze: false });
    expect(rowActions({ kind: 'approval' }, { ...caps, approveInPlace: true })).toEqual({ done: true, snooze: true });
  });
  it('other rows follow the caps', () => {
    expect(rowActions({ kind: 'task' }, caps)).toEqual({ done: true, snooze: true });
    expect(rowActions({ kind: 'post' }, { ...caps, done: false })).toEqual({ done: false, snooze: true });
  });
  it('a prompt that is not a stored task gets neither', () => {
    expect(rowActions({ kind: 'request', stored: false }, { ...caps, approveInPlace: true })).toEqual({ done: false, snooze: false });
  });
});

describe('calendar weeks in the add field, the needs card and the tickets', () => {
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  it.each(week)('today %s: "next week" typed in Add lands in Next week (next Monday)', (t) => {
    const d = dayFromWord(t, 'next week');
    expect(d).toBe(snoozeDays(t).nextMonday);
    expect(groupOf(t, d)).toBe('next');
    expect(parseTask(t, 'Call the venue next week').dueOn).toBe(d);
  });
  it('the sample day keeps the demo words', () => {
    expect(ticketTime(T, '2026-11-12T22:30:00Z').away).toBe('in 2 days');
    expect(ticketTime(T, '2026-11-18T22:00:00Z').away).toBe('next Wed');
    expect(dueWord(T, '2026-11-12')).toBe('Due Thu');
  });
  // Thursday to Sunday as today: "next <weekday>" only inside next calendar week, the date after it.
  it.each([
    ['2026-11-12', '2026-11-15', '2026-11-18', '2026-11-23'],
    ['2026-11-13', '2026-11-15', '2026-11-18', '2026-11-23'],
    ['2026-11-14', '2026-11-15', '2026-11-18', '2026-11-23'],
    ['2026-11-15', '2026-11-15', '2026-11-18', '2026-11-23'],
  ])('today %s', (t, sun, nextWed, after) => {
    const at = (d: string) => `${d}T17:00:00Z`;
    if (sun !== t) expect(ticketTime(t, at(sun)).away).toMatch(/^(tomorrow|in \d days)$/);
    expect(ticketTime(t, at(nextWed)).away).toBe('next Wed');
    expect(ticketTime(t, at(after)).away).toBe('Mon Nov 23');
    expect(dueWord(t, nextWed)).toBe('Due Wed Nov 18');
    expect(dueWord(t, after)).toBe('Due Mon Nov 23');
    if (daysFrom(t, sun) > 1) expect(dueWord(t, sun)).toBe('Due Sun');
  });
});

// "Add a task" reading day words, dates and first names (lib/cert-parse.ts, mock mode only).
import { describe, expect, it } from 'vitest';
import { dayFrom, parseTask } from '@/lib/cert-parse';

const T = '2026-11-10'; // a Tuesday
const people = [
  { id: 'tf', name: 'Toby Faraday', initials: 'TF' },
  { id: 'dm', name: 'Dana Mercer', initials: 'DM' },
];
const keep = { date: false, owner: false };

describe('dayFrom', () => {
  it('reads day words (never today for a weekday)', () => {
    expect(dayFrom(T, 'today')).toBe(T);
    expect(dayFrom(T, 'tomorrow')).toBe('2026-11-11');
    expect(dayFrom(T, 'fri')).toBe('2026-11-13');
    expect(dayFrom(T, 'tuesday')).toBe('2026-11-17');
    expect(dayFrom(T, 'next week')).toBe('2026-11-16');
  });
});

describe('parseTask', () => {
  it('takes the day and the owner out of the title', () => {
    expect(parseTask(T, 'draft the student form fri Toby', people, keep)).toEqual({ title: 'Draft the student form', due: '2026-11-13', owner: 'tf' });
  });
  it('reads a month and day; a passed month is next year', () => {
    expect(parseTask(T, 'Book room dec 4', people, keep).due).toBe('2026-12-04');
    expect(parseTask(T, 'Pay fees jan 15', people, keep).due).toBe('2027-01-15');
  });
  it('leaves a dismissed part in the title', () => {
    expect(parseTask(T, 'Call fri with Dana', people, { date: true, owner: false })).toEqual({ title: 'Call fri', due: null, owner: 'dm' });
    expect(parseTask(T, 'Call Dana', people, { date: false, owner: true })).toEqual({ title: 'Call Dana', due: null, owner: null });
  });
  it('keeps plain words as they are', () => {
    expect(parseTask(T, '  write   the email ', people, keep)).toEqual({ title: 'Write the email', due: null, owner: null });
  });
});

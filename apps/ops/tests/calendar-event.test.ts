import { describe, expect, it } from 'vitest';
import { ALL_DAY, checkEvent, easternToIso, EVENT_TIMES, eventTimes, timeLabel } from '@/lib/calendar-event';

const good = { title: 'Board call', date: '2026-10-12', time: '18:00', area: 'scholarships' };

describe('checkEvent', () => {
  it('accepts a full form and trims the title', () => {
    expect(checkEvent({ ...good, title: '  Board call  ' })).toEqual({ ok: true, title: 'Board call', date: '2026-10-12', time: '18:00', area: 'scholarships' });
  });
  it('asks for a title, a real date, a time and an area, in plain words', () => {
    expect(checkEvent({ ...good, title: '   ' })).toEqual({ ok: false, message: 'Give the event a title.' });
    expect(checkEvent({ ...good, date: '' })).toEqual({ ok: false, message: 'Pick a date.' });
    expect(checkEvent({ ...good, date: '2026-02-31' })).toEqual({ ok: false, message: 'Pick a date.' });
    expect(checkEvent({ ...good, time: '25:00' })).toEqual({ ok: false, message: 'Pick a time.' });
    expect(checkEvent({ ...good, area: 'admin' })).toEqual({ ok: false, message: 'Pick an area.' });
  });
  it('refuses a title over 200 characters', () => {
    expect(checkEvent({ ...good, title: 'x'.repeat(201) })).toEqual({ ok: false, message: 'Keep the title to 200 characters or fewer.' });
    expect(checkEvent({ ...good, title: 'x'.repeat(200) }).ok).toBe(true);
  });
  it('takes all four areas, including money (shown as Finance)', () => {
    for (const area of ['scholarships', 'programs', 'money', 'outreach']) expect(checkEvent({ ...good, area }).ok).toBe(true);
  });
  it('takes "all day" as a time', () => {
    expect(checkEvent({ ...good, time: ALL_DAY }).ok).toBe(true);
  });
});

describe('times', () => {
  it('lists all day, then every half hour from 7:00 AM to 10:00 PM', () => {
    expect(EVENT_TIMES[0]).toEqual({ value: ALL_DAY, label: 'All day' });
    expect(EVENT_TIMES[1]).toEqual({ value: '07:00', label: '7:00 AM' });
    expect(EVENT_TIMES.at(-1)).toEqual({ value: '22:00', label: '10:00 PM' });
    expect(EVENT_TIMES.find((t) => t.value === '18:00')?.label).toBe('6:00 PM');
  });
  it('labels clock times', () => {
    expect(timeLabel('00:00')).toBe('12:00 AM');
    expect(timeLabel('12:30')).toBe('12:30 PM');
    expect(timeLabel('09:05')).toBe('9:05 AM');
  });
  it('turns Eastern date and time into a timestamp, either side of daylight saving', () => {
    expect(easternToIso('2026-10-12', '18:00')).toBe('2026-10-12T22:00:00.000Z');
    expect(easternToIso('2026-12-01', '18:00')).toBe('2026-12-01T23:00:00.000Z');
    expect(easternToIso('2026-03-08', '12:00')).toBe('2026-03-08T16:00:00.000Z');
    expect(easternToIso('2026-11-01', '12:00')).toBe('2026-11-01T17:00:00.000Z');
  });
  it('saves all-day events at noon Eastern so they stay on their day', () => {
    expect(eventTimes('2026-10-12', ALL_DAY)).toEqual({ starts_at: '2026-10-12T16:00:00.000Z', all_day: true });
    expect(eventTimes('2026-10-12', '18:00')).toEqual({ starts_at: '2026-10-12T22:00:00.000Z', all_day: false });
  });
});

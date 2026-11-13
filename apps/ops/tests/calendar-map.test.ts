import { describe, expect, it } from 'vitest';
import { easternMinutes, headerDate, liveCalendarView, minutesOf, toViewItem } from '@/lib/calendar-map';
import type { CalItem } from '@/components/calendar/types';

const base: CalItem = { id: 'x', date: '2026-11-12', source: 'event', area: 'programs', chip: '7:00 Cert call', title: 'Cert call', start: '7:00 PM', people: ['u1'] };

describe('calendar-map', () => {
  it('reads clock words as minutes', () => {
    expect(minutesOf('10:00 AM')).toBe(600);
    expect(minutesOf('12:30 PM')).toBe(750);
    expect(minutesOf('12:05 AM')).toBe(5);
    expect(minutesOf(null)).toBeNull();
    expect(minutesOf('soon')).toBeNull();
  });
  it('reads Eastern minutes of an instant (EST in November)', () => {
    expect(easternMinutes('2026-11-10T14:14:00Z')).toBe(9 * 60 + 14);
    expect(headerDate('2026-11-10')).toBe('Tue, Nov 10');
  });
  it('maps an event: its chip is the title (the page adds the time)', () => {
    expect(toViewItem(base)).toMatchObject({ id: 'x', kind: 'event', time: 19 * 60, chip: 'Cert call', title: 'Cert call', endDate: null, waiting: null, done: false });
  });
  it('maps an interview to the student name and its code', () => {
    const i = toViewItem({ ...base, id: 'iv:1', source: 'interview', title: 'Interview Ada Okafor · APP-2026-00011', chip: '5:30 Interview', start: '5:30 PM', student: 'Ada Okafor', code: 'APP-2026-00011' });
    expect(i).toMatchObject({ kind: 'interview', title: 'Ada Okafor', code: 'APP-2026-00011', time: 1050 });
    expect(toViewItem({ ...base, source: 'interview', start: null })).toMatchObject({ title: 'Interview', code: null });
  });
  it('maps a bar: no time, its end day, the title without "to Fri Nov 20"', () => {
    const s = toViewItem({ ...base, source: 'cycle', span: true, endDate: '2026-11-20', title: 'Interviews, to Fri Nov 20', chip: 'Interviews, to Fri Nov 20' });
    expect(s).toMatchObject({ kind: 'span', title: 'Interviews', endDate: '2026-11-20', time: null, chip: 'Interviews, to Fri Nov 20' });
  });
  it('builds the live view: add and its undo on, share and nudge off, no needs card', () => {
    const v = liveCalendarView({ today: '2026-11-10', me: 'u1', people: [{ id: 'u1', name: 'Dana Mercer' }], items: [base], failed: false }, '2026-11-10T14:14:00Z');
    expect(v.caps).toEqual({ add: true, undoAdd: true, share: false, nudge: false });
    expect(v).toMatchObject({ needs: null, nowMin: 554, dateLabel: 'Tue, Nov 10', itemsFailed: false, me: 'u1' });
    expect(v.items).toHaveLength(1);
  });
});

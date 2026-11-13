import { describe, expect, it } from 'vitest';
import {
  addMonthsTo,
  agendaDays,
  cellLabel,
  chipText,
  dayFrom,
  dayHeading,
  dayWord,
  isPast,
  kindWord,
  monthGrid,
  monthWeeks,
  nextArea,
  nextUp,
  onDay,
  parseEvent,
  visibleItems,
  weekDay,
  weekOf,
  weekTitle,
  whenText,
} from '@/lib/calendar-time';
import { CALENDAR_VIEW, CALENDAR_VIEW_STRESS } from '@/mock/calendar-view';
import type { CalViewItem } from '@/lib/calendar-view';

const T = '2026-11-10'; // Tuesday
const items = CALENDAR_VIEW.items;
const ev = (o: Partial<CalViewItem> & Pick<CalViewItem, 'id' | 'date'>): CalViewItem => ({ kind: 'event', area: 'scholarships', endDate: null, time: null, title: o.id, code: null, chip: o.id, people: [], waiting: null, done: false, ...o });

describe('plain-word days', () => {
  it('says Today, Tomorrow, Yesterday, the weekday within 6 days, else the short date', () => {
    expect(dayWord(T, T)).toBe('Today');
    expect(dayWord(T, '2026-11-11')).toBe('Tomorrow');
    expect(dayWord(T, '2026-11-09')).toBe('Yesterday');
    expect(dayWord(T, '2026-11-12')).toBe('Thursday');
    expect(dayWord(T, '2026-11-16')).toBe('Monday');
    expect(dayWord(T, '2026-11-17')).toBe('Tue Nov 17');
    expect(cellLabel(T, T)).toBe('Today, Tue Nov 10');
    expect(dayHeading(T, '2026-11-12')).toBe('Thursday, Nov 12');
    expect(dayHeading(T, '2026-11-20')).toBe('Fri Nov 20');
  });
  it('titles a week across a month end and finds its Sunday', () => {
    expect(weekOf(T)).toBe('2026-11-08');
    expect(weekTitle('2026-11-08')).toBe('Nov 8 to 14');
    expect(weekTitle('2026-11-29')).toBe('Nov 29 to Dec 5');
    expect(addMonthsTo('2026-12-15', 1)).toBe('2027-01-01');
  });
});

describe('the month grid', () => {
  it('covers November 2026 in five Sunday-first rows (the demo rule)', () => {
    const w = monthWeeks('2026-11-01');
    expect(w).toHaveLength(5);
    expect(w[0][0]).toBe('2026-11-01');
    expect(w[4][6]).toBe('2026-12-05');
  });
  it('puts bars in lane 2 and three things a day, or two and "N more"', () => {
    const g = monthGrid('2026-11-01', CALENDAR_VIEW_STRESS.items);
    const week2 = g[1];
    expect(week2.bars.map((b) => [b.item.id, b.col, b.span, b.lane])).toEqual([['win', 2, 5, 2]]);
    // Thu Nov 12 (col 4) has six things in stress: two chips and "4 more".
    const thu = week2.chips.filter((c) => c.col === 4);
    expect(thu).toHaveLength(2);
    expect(week2.more).toEqual([{ col: 4, lane: 5, n: 4, day: '2026-11-12' }]);
    // Fri Nov 13 has two things, both drawn, under the bar.
    expect(week2.chips.filter((c) => c.col === 5).map((c) => c.lane)).toEqual([3, 4]);
  });
  it('draws chip words as the demo', () => {
    const byId = (id: string) => items.find((i) => i.id === id)!;
    expect(chipText(byId('i11'))).toBe('5:30 Ada');
    expect(chipText(byId('cert'))).toBe('Cert call 7:00');
    expect(chipText(byId('sent'))).toBe('Times sent');
  });
});

describe('a day and the agenda', () => {
  it('orders bars, cycle dates, timed things, then untimed things (stable)', () => {
    expect(onDay(items, '2026-11-12').map((i) => i.id)).toEqual(['win', 'i11', 'rem', 'prep']);
    expect(onDay(items, T).map((i) => i.id)).toEqual(['win', 'sent']);
  });
  it('words a bar after its first day and marks past things', () => {
    const win = items.find((i) => i.id === 'win')!;
    expect(whenText(win, T)).toBe('All day');
    expect(whenText(win, '2026-11-12')).toBe('Ongoing');
    expect(whenText(win, '2026-11-20')).toBe('Last day');
    expect(isPast(T, 554, items.find((i) => i.id === 'sent')!)).toBe(true);
    expect(isPast(T, 554, items.find((i) => i.id === 'i11')!)).toBe(false);
  });
  it('lists the chosen day and the 20 after it, a bar only on its first day or the first day listed', () => {
    const a = agendaDays(items, T);
    expect(a.to).toBe('2026-11-30');
    expect(a.days[0]).toMatchObject({ day: T });
    expect(a.days[0].items.map((i) => i.id)).toEqual(['win', 'sent']);
    expect(a.days[1].items.map((i) => i.id)).toEqual(['ig']);
    const later = agendaDays(items, '2026-11-12');
    expect(later.days[0].items[0].id).toBe('win');
  });
  it('filters by person (whole-board things stay) and area', () => {
    const keith = visibleItems(items, 'keith', '');
    expect(keith.some((i) => i.id === 'grant')).toBe(true);
    expect(keith.some((i) => i.id === 'q4')).toBe(false);
    expect(keith.some((i) => i.id === 'sel')).toBe(true);
    expect(visibleItems(items, '', 'money').map((i) => i.id)).toEqual(['q4', 'grant']);
  });
  it('marks the week strip: gold first (at most 2), at most 3 in all', () => {
    expect(weekDay(items, '2026-11-12', 'dana')).toEqual({ count: 3, mine: 3, marks: ['g', 'g'] });
    expect(weekDay(CALENDAR_VIEW_STRESS.items, '2026-11-12', 'keith')).toMatchObject({ count: 6, mine: 2, marks: ['g', 'g', 'o'] });
    expect(weekDay(items, '2026-11-14', 'dana').marks).toEqual([]);
  });
  it('picks the next timed thing still to come', () => {
    expect(nextUp(items, T, 554)?.id).toBe('i11');
    expect(nextUp([ev({ id: 'a', date: T, time: 600 }), ev({ id: 'b', date: T, time: 500 })], T, 554)?.id).toBe('a');
    expect(nextUp([ev({ id: 'c', date: '2026-11-09', time: 900 })], T, 554)).toBeNull();
  });
});

describe('add an event in place', () => {
  it('reads "Board call thu 7pm" as Thursday at 7:00 PM', () => {
    const p = parseEvent('Board call thu 7pm', T);
    expect(p).toMatchObject({ title: 'Board call', day: '2026-11-12', time: 19 * 60, area: null, found: { day: true, time: true, area: false } });
  });
  it('takes the first area keyword, minutes, noon and "at"', () => {
    expect(parseEvent('grant review with donors tomorrow at 9:30am', T)).toMatchObject({ title: 'Grant review with donors', day: '2026-11-11', time: 570, area: 'money' });
    expect(parseEvent('instagram post noon', T)).toMatchObject({ time: 720, area: 'outreach' });
  });
  it('turns a dismissed day or time back into words, and the area chip wins', () => {
    const p = parseEvent('call fri 3pm', T, { day: true, time: true }, 'programs');
    expect(p).toMatchObject({ title: 'Call fri 3pm', day: null, time: null, area: 'programs', found: { day: false, time: false, area: true } });
    expect(nextArea('outreach')).toBe('scholarships');
    expect(nextArea('scholarships')).toBe('money');
  });
  it('reads days: a weekday a week on when it is today, month names this year, no Nov 31', () => {
    expect(dayFrom('tue', T)).toBe('2026-11-17');
    expect(dayFrom('mon', T)).toBe('2026-11-16');
    expect(dayFrom('dec 3', T)).toBe('2026-12-03');
    expect(dayFrom('nov 31', T)).toBeNull();
    expect(dayFrom('tonight', T)).toBe(T);
    expect(parseEvent('Retreat dec 31', '2026-12-30').day).toBe('2026-12-31');
  });
  it('rolls a month and day more than 30 days back into next year (typed on Dec 20)', () => {
    expect(dayFrom('jan 15', '2026-12-20')).toBe('2027-01-15');
    expect(parseEvent('Retreat jan 15 9am', '2026-12-20')).toMatchObject({ title: 'Retreat', day: '2027-01-15', time: 540 });
    expect(dayFrom('dec 1', '2026-12-20')).toBe('2026-12-01');
    expect(dayFrom('nov 20', '2026-12-20')).toBe('2026-11-20'); // 30 days back: stays
    expect(dayFrom('nov 19', '2026-12-20')).toBe('2027-11-19'); // 31 days back: next year
    expect(dayFrom('feb 29', '2026-12-20')).toBeNull();
  });
  it('reads a 24-hour time and refuses an hour over 12 with am / pm', () => {
    expect(parseEvent('Board call thu 19:30', T)).toMatchObject({ title: 'Board call', day: '2026-11-12', time: 19 * 60 + 30 });
    expect(parseEvent('Standup 0:05', T).time).toBe(5);
    expect(parseEvent('Call 13pm', T)).toMatchObject({ title: 'Call 13pm', time: null });
    expect(parseEvent('Call 0am', T).time).toBeNull();
    expect(parseEvent('Call 12am', T).time).toBe(0);
    expect(parseEvent('Call 12pm', T).time).toBe(720);
    expect(parseEvent('Call 24:00', T).time).toBeNull();
  });
  it('says the stored kind of an event, else Meeting', () => {
    expect(kindWord('event')).toBe('Meeting');
    expect(kindWord('event', 'planning_call')).toBe('Planning call');
    expect(kindWord('event', 'odd')).toBe('Meeting');
    expect(kindWord('interview', 'meeting')).toBe('Interview, 30 min');
  });
  it('gives an empty title when only a day and time are typed', () => {
    expect(parseEvent('thu 7pm', T).title).toBe('');
  });
});

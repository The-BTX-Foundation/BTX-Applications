import { describe, expect, it } from 'vitest';
import { affected, barScale, dayLine, evenNote, groupByDay, limitNote, moveLine, overNote, proposedHeadline, rebalanceConfirm, shortName, targetLine, waitingLine, type FairPerson, type TimeChip } from '@/lib/interview-times';

// Nov 2026 is Eastern standard time (UTC-5): 6:00 PM ET = 23:00Z.
const chip = (id: string, startsAt: string, booked = false): TimeChip => ({ slotId: id, startsAt, time: '', freeCount: 3, opened: false, booked, bookedBy: booked ? 'Sade Price' : null });
const person = (name: string, interviews: number, target: number | null, max: number | null = null): FairPerson => ({ userId: name, name, interviews, target, maxInterviews: max, overBy: target === null ? 0 : interviews - target });

describe('groupByDay', () => {
  it('lists every day of the window, empty ones too, with times in order', () => {
    const days = groupByDay('2026-11-10', '2026-11-12', [chip('b', '2026-11-12T00:30:00Z'), chip('a', '2026-11-11T23:00:00Z')]);
    // 2026-11-12T00:30Z is 7:30 PM on Nov 11 in Eastern time.
    expect(days.map((d) => [d.label, d.times.length])).toEqual([['Tue Nov 10', 0], ['Wed Nov 11', 2], ['Thu Nov 12', 0]]);
    expect(days[1].times.map((t) => t.slotId)).toEqual(['a', 'b']);
  });
  it('keeps a time outside the dates on its own day', () => {
    expect(groupByDay('2026-11-10', '2026-11-10', [chip('x', '2026-11-20T23:00:00Z')]).map((d) => d.day)).toEqual(['2026-11-10', '2026-11-20']);
  });
});

describe('dayLine', () => {
  const day = { day: '2026-11-11', label: 'Wed Nov 11', times: [chip('a', '2026-11-11T23:00:00Z', true), chip('b', '2026-11-11T23:30:00Z')] };
  it('counts before and after sending', () => {
    expect(dayLine(day, false)).toBe('2 times');
    expect(dayLine(day, true)).toBe('1 booked · 1 open');
    expect(dayLine({ ...day, times: [] }, true)).toBe('No times');
  });
});

describe('wording', () => {
  it('shortens names', () => {
    expect(shortName('Sade Price')).toBe('Sade P.');
    expect(shortName('Cher')).toBe('Cher');
  });
  it('says who is still to send', () => {
    expect(waitingLine(['Marcus Davis', 'Darien Strachan'])).toBe('Still waiting on Marcus Davis and Darien Strachan.');
    expect(waitingLine(['A B'])).toBe('Still waiting on A B.');
    expect(waitingLine([])).toBe('');
  });
  it('words the proposed headline', () => {
    expect(proposedHeadline(24, 18, 0)).toBe('24 times proposed for 18 applicants. Every time has at least 2 free board members.');
    expect(proposedHeadline(24, 18, 2)).toBe('24 times proposed for 18 applicants. 2 times have fewer than 2 free board members.');
    expect(proposedHeadline(0, 18, 0)).toBe('No times fit the availability yet.');
  });
});

describe('fairness', () => {
  const before = [person('Dania Morris', 5, 5), person('Kelsey Davis', 7, 5), person('Cillisha Knights', 5, 5), person('Marcus Davis', 4, 4, 4), person('Tomi Falodun', 7, 5), person('Chariah Ghee', 4, 5), person('Darien Strachan', 4, 5)];
  const after = [person('Dania Morris', 5, 5), person('Kelsey Davis', 5, 5), person('Cillisha Knights', 5, 5), person('Marcus Davis', 4, 4, 4), person('Tomi Falodun', 6, 5), person('Chariah Ghee', 5, 5), person('Darien Strachan', 6, 5)];
  it('explains the target', () => {
    expect(targetLine(before, 18)).toEqual({ base: 5, line: 'Target 5 each: 18 interviews × 2 ÷ 7' });
  });
  it('scales the bars to at least 8', () => {
    expect(barScale([5, 7, 4])).toBe(8);
    expect(barScale([9])).toBe(10);
  });
  it('flags two or more over, not one', () => {
    expect(overNote(before[1])).toEqual({ text: '2 over target', flag: true });
    expect(overNote(after[4])).toEqual({ text: '1 over', flag: false });
    expect(overNote(before[0])).toBeNull();
    expect(overNote(person('X', 3, null))).toBeNull();
  });
  it('notes limits', () => {
    expect(limitNote(before[3])).toBe('Limit 4, at limit');
    expect(limitNote(person('Y', 2, 4, 4))).toBe('Limit 4');
    expect(limitNote(before[0])).toBe('');
  });
  it('says why an even split is not exact', () => {
    expect(evenNote(after, 5)).toBe('As even as it can be. Marcus Davis is at their limit, so two people have 6.');
    expect(evenNote([person('A', 5, 5), person('B', 6, 5)], 5)).toBe('As even as it can be, so one person has 6.');
    expect(evenNote([person('A', 5, 5)], 5)).toBe('Everyone has an even share.');
  });
});

describe('moves', () => {
  const m = (id: string, from: string, to: string) => ({ slotId: id, startsAt: '2026-11-13T00:00:00Z', applicant: 'Jordan Wells', fromName: from, toName: to, from, to });
  it('prints one line per move', () => {
    expect(moveLine(m('a', 'Tomi Falodun', 'Chariah Ghee'))).toBe('Thu Nov 12, 7:00 PM · Jordan Wells · Tomi Falodun → Chariah Ghee');
  });
  it('counts the people affected once', () => {
    const moves = [m('a', 'Kelsey Davis', 'Darien Strachan'), m('b', 'Kelsey Davis', 'Chariah Ghee'), m('c', 'Tomi Falodun', 'Darien Strachan')];
    expect(affected(moves)).toEqual(['Kelsey Davis', 'Darien Strachan', 'Chariah Ghee', 'Tomi Falodun']);
    expect(rebalanceConfirm(moves)).toBe('Moves 3 interviews. Nothing within 48 hours moves. The 4 people affected get an email.');
    expect(rebalanceConfirm([])).toMatch(/^Nothing needs to move/);
  });
});

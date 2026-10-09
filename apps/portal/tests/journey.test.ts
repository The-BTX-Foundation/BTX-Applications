import { describe, expect, it } from 'vitest';
import { countdown, describeFreeTimes, groupByDay, mondayOf, pickState, range, slotsThatFit, soonTitle, type JourneyInput } from '@/lib/journey';

const base: JourneyInput = {
  now: new Date('2026-09-15T16:00:00Z'),
  interviewStart: '2026-09-15',
  interviewEnd: '2026-10-09',
  booking: null,
  freeTimes: null,
  decision: null,
};
const oct6 = { slotId: 's', startsAt: '2026-10-06T22:00:00Z', endsAt: '2026-10-06T22:30:00Z', bookedAt: '2026-09-15T15:55:00Z', switched: false };

describe('status state picker', () => {
  it('waits before the interviews open, and when the cycle sets no interview dates', () => {
    expect(pickState({ ...base, now: new Date('2026-09-13T16:00:00Z') })).toBe('waiting');
    expect(pickState({ ...base, interviewStart: null })).toBe('waiting');
  });
  it('asks her to book once the interviews open, using Eastern dates', () => {
    expect(pickState(base)).toBe('book');
    // 03:00 UTC on Sep 15 is still Sep 14 in Eastern time
    expect(pickState({ ...base, now: new Date('2026-09-15T03:00:00Z') })).toBe('waiting');
  });
  it('shows the sent screen after she sent her free times', () => {
    expect(pickState({ ...base, freeTimes: { days: ['Sun'], windows: ['morning'], note: '' } })).toBe('sent');
  });
  it('shows booked, then switched, in the first day', () => {
    expect(pickState({ ...base, booking: oct6 })).toBe('booked');
    expect(pickState({ ...base, booking: { ...oct6, switched: true } })).toBe('switched');
  });
  it('drops the just-booked look after a day', () => {
    const now = new Date('2026-09-20T16:00:00Z');
    expect(pickState({ ...base, now, booking: oct6 })).toBe('booked');
  });
  it('counts down: soon at 1 to 3 days, today on the day', () => {
    expect(pickState({ ...base, now: new Date('2026-10-04T16:00:00Z'), booking: oct6 })).toBe('soon');
    expect(pickState({ ...base, now: new Date('2026-10-03T16:00:00Z'), booking: oct6 })).toBe('soon');
    expect(pickState({ ...base, now: new Date('2026-10-02T16:00:00Z'), booking: oct6 })).toBe('booked');
    expect(pickState({ ...base, now: new Date('2026-10-06T21:52:00Z'), booking: oct6 })).toBe('today');
  });
  it('shows after once the interview is over, or the weeks end with no time', () => {
    expect(pickState({ ...base, now: new Date('2026-10-06T23:00:00Z'), booking: oct6 })).toBe('after');
    expect(pickState({ ...base, now: new Date('2026-10-10T16:00:00Z') })).toBe('after');
  });
  it('shows the decision whenever the database returns one (null until released), with no date check', () => {
    const late = new Date('2026-10-23T14:00:00Z');
    expect(pickState({ ...base, now: late, booking: oct6 })).toBe('after');
    expect(pickState({ ...base, now: late, booking: oct6, decision: { kind: 'won', storySent: false } })).toBe('won');
    expect(pickState({ ...base, now: late, booking: oct6, decision: { kind: 'won', storySent: true } })).toBe('won-sent');
    expect(pickState({ ...base, now: late, booking: oct6, decision: { kind: 'not-picked' } })).toBe('not-picked');
    // released early by an admin: it shows; not released: the database sends null and the interview-done screen stays
    expect(pickState({ ...base, now: new Date('2026-10-12T14:00:00Z'), booking: oct6, decision: { kind: 'won', storySent: false } })).toBe('won');
    expect(pickState({ ...base, now: new Date('2026-10-30T14:00:00Z'), booking: oct6, decision: null })).toBe('after');
  });
});

describe('journey text', () => {
  it('counts down in the words the screens use', () => {
    const at = '2026-10-06T22:00:00Z';
    expect(countdown(new Date('2026-09-15T16:00:00Z'), at)).toBe('In 3 weeks');
    expect(countdown(new Date('2026-10-03T16:00:00Z'), at)).toBe('In 3 days');
    expect(countdown(new Date('2026-10-05T16:00:00Z'), at)).toBe('Tomorrow');
    expect(countdown(new Date('2026-10-06T21:52:00Z'), at)).toBe('Starts in 8 minutes');
    expect(soonTitle(new Date('2026-10-04T16:00:00Z'), at)).toBe('Two days to go');
  });
  it('writes the interview range', () => {
    expect(range('2026-10-06T22:00:00Z', '2026-10-06T22:30:00Z')).toBe('6:00 to 6:30 PM');
    expect(range('2026-10-06T15:30:00Z', '2026-10-06T16:00:00Z')).toBe('11:30 AM to 12:00 PM');
  });
  it('groups slots by Eastern day and finds Mondays', () => {
    const g = groupByDay([
      { id: 'b', startsAt: '2026-10-06T23:00:00Z', endsAt: '' },
      { id: 'a', startsAt: '2026-10-06T22:00:00Z', endsAt: '' },
      { id: 'c', startsAt: '2026-10-07T16:00:00Z', endsAt: '' },
    ]);
    expect(g.map((x) => [x.day, x.slots.map((s) => s.id)])).toEqual([['2026-10-06', ['a', 'b']], ['2026-10-07', ['c']]]);
    expect(mondayOf('2026-10-06')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
  });
  it('finds the open times that fit her days and windows', () => {
    const slots = [
      { id: 'sun-am', startsAt: '2026-09-20T14:00:00Z', endsAt: '' }, // Sun 10 AM
      { id: 'sun-pm', startsAt: '2026-09-20T22:00:00Z', endsAt: '' }, // Sun 6 PM
      { id: 'mon-am', startsAt: '2026-09-21T14:00:00Z', endsAt: '' },
    ];
    expect(slotsThatFit(slots, ['Sun'], ['morning']).map((s) => s.id)).toEqual(['sun-am']);
    expect(slotsThatFit(slots, ['Sun', 'Mon'], ['morning', 'evening']).map((s) => s.id)).toEqual(['sun-am', 'sun-pm', 'mon-am']);
    expect(slotsThatFit(slots, [], ['morning'])).toEqual([]);
  });
  it('describes free times', () => {
    expect(describeFreeTimes({ days: ['Sun'], windows: ['morning'], note: '' })).toBe('Sundays, mornings.');
    expect(describeFreeTimes({ days: ['Tue', 'Sun'], windows: ['evening', 'morning'], note: '' })).toBe('Tuesdays and Sundays, mornings and evenings.');
  });
});

import { buildIcs } from '@/lib/ics';
describe('calendar file', () => {
  it('writes one event in UTC', () => {
    const ics = buildIcs({ uid: 'x', startsAt: '2026-10-06T22:00:00Z', endsAt: '2026-10-06T22:30:00Z', title: 'BTX interview', description: 'Video call, 30 minutes', now: new Date('2026-09-15T16:00:00Z') });
    expect(ics).toContain('DTSTART:20261006T220000Z');
    expect(ics).toContain('DTEND:20261006T223000Z');
    expect(ics).toContain('DESCRIPTION:Video call\\, 30 minutes');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});

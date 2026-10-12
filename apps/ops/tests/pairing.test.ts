import { describe, expect, it } from 'vitest';
import { blockOf, dayOf, pairInterviews, type AvailabilityRow, type PairingPerson } from '@/lib/pairing';

// Oct 2026 is Eastern daylight time (UTC-4): 10:00 AM ET = 14:00Z.
const at = (day: string, hh: number, mm = 0) => new Date(Date.parse(`${day}T00:00:00Z`) + ((hh + 4) * 60 + mm) * 60_000).toISOString();
const D = '2026-10-15';
const people: PairingPerson[] = [
  { userId: 'u-chariah', name: 'Chariah Ghee' },
  { userId: 'u-dania', name: 'Dania Morris' },
  { userId: 'u-kelsey', name: 'Kelsey Davis' },
  { userId: 'u-tomi', name: 'Tomi Falodun' },
];
const everyoneFree = (day: string, block: AvailabilityRow['block']): AvailabilityRow[] => people.map((p) => ({ userId: p.userId, day, block }));

describe('blockOf and dayOf (Eastern time)', () => {
  it('splits the day at noon and 5 PM', () => {
    expect(blockOf(at(D, 9))).toBe('morning');
    expect(blockOf(at(D, 11, 30))).toBe('morning');
    expect(blockOf(at(D, 12))).toBe('afternoon');
    expect(blockOf(at(D, 16, 30))).toBe('afternoon');
    expect(blockOf(at(D, 17))).toBe('evening');
    expect(blockOf(at(D, 20, 30))).toBe('evening');
  });
  it('uses the Eastern calendar day, not the UTC day', () => {
    expect(dayOf(at(D, 21))).toBe(D); // 9 PM ET is already the next day in UTC
    expect(dayOf('2026-10-16T01:00:00.000Z')).toBe('2026-10-15');
  });
});

describe('pairInterviews', () => {
  it('picks the two people with the fewest interviews so far', () => {
    const r = pairInterviews({
      slots: [{ id: 's1', startsAt: at(D, 10) }],
      people,
      availability: everyoneFree(D, 'morning'),
      counts: { 'u-chariah': 3, 'u-dania': 0, 'u-kelsey': 1, 'u-tomi': 2 },
    });
    expect(r.assignments).toEqual([{ slotId: 's1', interviewerA: 'u-dania', interviewerB: 'u-kelsey' }]);
    expect(r.unpaired).toEqual([]);
  });

  it('breaks ties by name, A to Z', () => {
    const r = pairInterviews({ slots: [{ id: 's1', startsAt: at(D, 10) }], people, availability: everyoneFree(D, 'morning'), counts: {} });
    expect(r.assignments[0]).toMatchObject({ interviewerA: 'u-chariah', interviewerB: 'u-dania' });
  });

  it('only uses people free in the slot\'s day and part of day', () => {
    const availability: AvailabilityRow[] = [
      { userId: 'u-chariah', day: D, block: 'afternoon' }, // wrong part of day
      { userId: 'u-dania', day: D, block: 'morning' },
      { userId: 'u-kelsey', day: '2026-10-16', block: 'morning' }, // wrong day
      { userId: 'u-tomi', day: D, block: 'morning' },
    ];
    const r = pairInterviews({ slots: [{ id: 's1', startsAt: at(D, 10) }], people, availability, counts: {} });
    expect(r.assignments[0]).toMatchObject({ interviewerA: 'u-dania', interviewerB: 'u-tomi' });
  });

  it('always picks two different people', () => {
    const r = pairInterviews({ slots: [{ id: 's1', startsAt: at(D, 10) }], people: [...people, people[0]], availability: everyoneFree(D, 'morning'), counts: {} });
    const a = r.assignments[0];
    expect(a.interviewerA).not.toBe(a.interviewerB);
  });

  it('leaves a slot unpaired when fewer than two people are free', () => {
    const r = pairInterviews({
      slots: [{ id: 's1', startsAt: at(D, 10) }, { id: 's2', startsAt: at(D, 18) }],
      people,
      availability: [{ userId: 'u-dania', day: D, block: 'morning' }, { userId: 'u-tomi', day: D, block: 'morning' }, { userId: 'u-kelsey', day: D, block: 'evening' }],
      counts: {},
    });
    expect(r.assignments.map((a) => a.slotId)).toEqual(['s1']);
    expect(r.unpaired).toEqual([{ slotId: 's2', reason: 'not_enough_available' }]);
  });

  it('gives nobody when nobody is free', () => {
    const r = pairInterviews({ slots: [{ id: 's1', startsAt: at(D, 10) }], people, availability: [], counts: {} });
    expect(r.assignments).toEqual([]);
    expect(r.unpaired).toHaveLength(1);
  });

  it('counts the interviews it just paired, so the load spreads out', () => {
    const slots = [10, 11, 12].map((h, i) => ({ id: `s${i}`, startsAt: at(D, h) }));
    // 10 and 11 are mornings, 12 is the afternoon
    const availability = [...everyoneFree(D, 'morning'), ...everyoneFree(D, 'afternoon')];
    const r = pairInterviews({ slots, people, availability, counts: {} });
    expect(r.assignments.map((a) => [a.interviewerA, a.interviewerB])).toEqual([
      ['u-chariah', 'u-dania'],
      ['u-kelsey', 'u-tomi'],
      ['u-chariah', 'u-dania'],
    ]);
  });

  it('does not put someone in two overlapping interviews', () => {
    const r = pairInterviews({
      slots: [{ id: 's1', startsAt: at(D, 10) }],
      people,
      availability: everyoneFree(D, 'morning'),
      counts: {},
      busy: [{ userId: 'u-chariah', startsAt: at(D, 10), endsAt: at(D, 10, 30) }],
    });
    expect(r.assignments[0]).toMatchObject({ interviewerA: 'u-dania', interviewerB: 'u-kelsey' });
  });

  it('handles slots given out of order', () => {
    const r = pairInterviews({
      slots: [{ id: 'late', startsAt: at(D, 11) }, { id: 'early', startsAt: at(D, 10) }],
      people,
      availability: everyoneFree(D, 'morning'),
      counts: {},
    });
    expect(r.assignments.map((a) => a.slotId)).toEqual(['early', 'late']);
  });
});

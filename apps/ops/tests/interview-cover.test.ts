// Interview cover helpers: which interviews a save takes someone off, "Needs cover", the reassign order, the
// once-a-day reminder key, and the Availability page's mock overlap check. Free hours are saved in 30-minute steps.
import { describe, expect, it } from 'vitest';
import { freeFor, needsCoverIds, remindedToday, remindKey, replacements, sameIds, soonLine, startsSoon, uncoveredFor, type PairedInterview } from '@/lib/interview-cover';
import { coverAsk, mockOff } from '@/lib/availability-flow';

const NOW = new Date('2026-11-13T15:00:00Z');
// 5:30 to 6:00 PM Eastern on Fri Nov 20 (EST, UTC-5): minutes 1050 to 1080.
const iv = (slotId: string, startsAt: string, a = 'u1', b = 'u2'): PairedInterview => ({ slotId, startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(), a, b });
const FRI = iv('s1', '2026-11-20T22:30:00Z');
const SAT = iv('s2', '2026-11-21T15:00:00Z'); // 10:00 AM Eastern, minute 600
const PAST = iv('s0', '2026-11-12T22:30:00Z');

describe('startsSoon (the 48-hour rule, as Rebalance)', () => {
  it('is true up to 48 hours ahead and false after', () => {
    expect(startsSoon('2026-11-15T14:59:00Z', NOW)).toBe(true);
    expect(startsSoon('2026-11-15T15:00:00Z', NOW)).toBe(true);
    expect(startsSoon('2026-11-15T15:01:00Z', NOW)).toBe(false);
    expect(startsSoon(FRI.startsAt, NOW)).toBe(false);
  });
  it('the Availability line for one that stays', () => {
    expect(soonLine('Ada Okafor, Sat Nov 14, 10:00 AM')).toBe('Ada Okafor, Sat Nov 14, 10:00 AM: starts soon, so you stay on it. An admin has been told.');
  });
});

describe('freeFor', () => {
  it('needs the whole interview inside the free hours', () => {
    expect(freeFor([{ day: '2026-11-20', startMin: 1020, endMin: 1080 }], FRI.startsAt, FRI.endsAt)).toBe(true);
    expect(freeFor([{ day: '2026-11-20', startMin: 1080, endMin: 1140 }], FRI.startsAt, FRI.endsAt)).toBe(false);
    expect(freeFor([], FRI.startsAt, FRI.endsAt)).toBe(false);
  });
  it('two ranges that meet cover a time across the join', () => {
    expect(freeFor([{ day: '2026-11-20', startMin: 1020, endMin: 1050 }, { day: '2026-11-20', startMin: 1050, endMin: 1110 }], FRI.startsAt, FRI.endsAt)).toBe(true);
  });
});

describe('uncoveredFor (availability overlap)', () => {
  const ranges = [{ day: '2026-11-21', startMin: 540, endMin: 720 }];
  it('lists only that person’s future interviews the new hours no longer cover, earliest first', () => {
    const other = iv('s3', '2026-11-20T21:00:00Z', 'u3', 'u4');
    const later = iv('s4', '2026-11-22T15:00:00Z');
    expect(uncoveredFor('u1', [later, SAT, FRI, PAST, other], ranges, NOW).map((i) => i.slotId)).toEqual(['s1', 's4']);
  });
  it('is empty when every interview is still covered', () => {
    expect(uncoveredFor('u2', [SAT], ranges, NOW)).toEqual([]);
  });
});

describe('needsCoverIds (derived "Needs cover")', () => {
  const free = new Map([
    ['u1', [{ day: '2026-11-20', startMin: 960, endMin: 1200 }]],
    ['u2', [{ day: '2026-11-20', startMin: 960, endMin: 1200 }]],
  ]);
  it('flags an interview when either interviewer is no longer free then', () => {
    expect([...needsCoverIds([FRI, SAT], free, NOW)]).toEqual(['s2']);
  });
  it('someone with no free hours left counts as not free', () => {
    expect([...needsCoverIds([iv('s5', FRI.startsAt, 'u1', 'u9')], free, NOW)]).toEqual(['s5']);
  });
  it('past interviews never need cover', () => {
    expect(needsCoverIds([PAST], new Map(), NOW).size).toBe(0);
  });
});

describe('replacements', () => {
  const c = (userId: string, interviewsSoFar: number, freeMinutesLeft: number, name = userId) => ({ userId, name, interviewsSoFar, freeMinutesLeft });
  it('leaves out the pair and puts the least loaded first (interviews, then free minutes left, then name)', () => {
    const out = replacements([c('u1', 0, 10), c('b', 2, 30), c('a', 1, 90), c('z', 1, 60, 'Zed'), c('y', 1, 60, 'Amy')], ['u1', 'u2']);
    expect(out.map((x) => x.userId)).toEqual(['y', 'z', 'a', 'b']);
  });
  it('is empty when only the pair is free', () => {
    expect(replacements([c('u1', 0, 0), c('u2', 0, 0)], ['u1', 'u2'])).toEqual([]);
  });
});

describe('remind dedupe key', () => {
  it('one key per address per Eastern day', () => {
    expect(remindKey(' Ana@Terpmail.UMD.edu ', NOW)).toBe('ana@terpmail.umd.edu|2026-11-13');
    // 11:30 PM Eastern on Nov 13 is still the 13th.
    expect(remindKey('a@b.c', new Date('2026-11-14T04:30:00Z'))).toBe('a@b.c|2026-11-13');
  });
  it('remindedToday reads Eastern days', () => {
    expect(remindedToday(['2026-11-13T13:00:00Z'], NOW)).toBe(true);
    expect(remindedToday(['2026-11-13T04:00:00Z'], NOW)).toBe(false);
    expect(remindedToday([], NOW)).toBe(false);
  });
});

describe('sameIds', () => {
  it('compares sets in any order', () => {
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIds(['a'], ['a', 'b'])).toBe(false);
    expect(sameIds(['a', 'a'], ['a', 'b'])).toBe(false);
  });
});

describe('Availability confirm (mock overlap and words)', () => {
  const label = (day: string, min: number) => `${day} ${min}`;
  const bookings = [
    { id: 'b1', day: '2026-11-20', min: 1050, applicant: 'Naomi Reed' },
    { id: 'b2', day: '2026-11-21', min: 600, applicant: 'Leo Park' },
  ];
  it('lists the booked times the new free hours no longer cover', () => {
    expect(mockOff(bookings, [{ day: '2026-11-21', startMin: 540, endMin: 660 }], label)).toEqual([{ slotId: 'b1', line: 'Naomi Reed, 2026-11-20 1050' }]);
  });
  it('a half-covered time counts as removed', () => {
    expect(mockOff(bookings.slice(0, 1), [{ day: '2026-11-20', startMin: 1080, endMin: 1200 }], label)).toHaveLength(1);
  });
  it('asks in plain words', () => {
    expect(coverAsk([{ slotId: 'b1', line: 'x' }])).toBe("This removes you from 1 interview. We'll find cover.");
    expect(coverAsk([{ slotId: 'b1', line: 'x' }, { slotId: 'b2', line: 'y' }])).toBe("This removes you from 2 interviews. We'll find cover.");
  });
});

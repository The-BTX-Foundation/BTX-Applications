// The refreshed Interviews page's pure helpers (lib/interviews-map.ts): the live caps (no control without an existing
// action), the "add a time" parser and its demo error lines, the calendar weeks, the date words, the gold card's stage
// and the live mapping from the existing loader's data.
import { describe, expect, it } from 'vitest';
import type { InterviewsData } from '@/lib/interviews';
import { capsFor, izRel, mapLive, needsStage, NO_CAPS, pairText, parseAdd, rangeLabel, weeksOf } from '@/lib/interviews-map';
import type { InterviewsView } from '@/lib/interviews-view';

const none = () => false;
const FIRST = '2026-11-10';
const LAST = '2026-11-20';

describe('capsFor', () => {
  it('live: the two controls with no existing action are off, the real ones on (Remind and the unbooked list included)', () => {
    const c = capsFor(true, true, true);
    expect([c.undoTime, c.nudge]).toEqual([false, false]);
    expect([c.remindStudents, c.seeWho]).toEqual([true, true]);
    expect([c.makeLinks, c.pasteLink, c.rebuild, c.addTime, c.removeTime, c.sendTimes, c.remindBoard, c.rebalance, c.pairing].every(Boolean)).toBe(true);
  });
  it('mock: the whole demo for admins', () => {
    expect(Object.values(capsFor(false, true, true)).every(Boolean)).toBe(true);
  });
  it('a non-admin or a page with no cycle gets nothing, live or mock', () => {
    expect(capsFor(true, false, true)).toEqual(NO_CAPS);
    expect(capsFor(false, false, true)).toEqual(NO_CAPS);
    expect(capsFor(true, true, false)).toEqual(NO_CAPS);
  });
});

describe('parseAdd', () => {
  const p = (t: string, taken = none) => parseAdd(t, FIRST, FIRST, FIRST, LAST, taken);
  it('reads 7:30 pm, 730p and 19:30 the same', () => {
    for (const t of ['7:30 pm', '730p', '19:30']) expect(p(t)).toMatchObject({ day: FIRST, minute: 19 * 60 + 30, err: null });
  });
  it('a bare 1 to 8 means PM', () => {
    expect(p('7').minute).toBe(19 * 60);
  });
  it('gives the demo lines for off-grid, out-of-hours, outside the dates and taken times', () => {
    expect(p('7:15 pm').err).toBe('Times start on the hour or half hour.');
    expect(p('10 pm').err).toBe('Interview times run 9:00 AM to 9:00 PM.');
    expect(p('next sun 6pm').err).toBe('Interviews run Tue Nov 10 to Fri Nov 20.');
    expect(p('6 pm', () => true).err).toBe('6:00 PM is already a time on Tue.');
    expect(p('25:00').err).toBe("That isn't a time.");
  });
  it('a day word moves the day: "thu" is Nov 12, "next mon" Nov 23 (outside), "tomorrow" Nov 11', () => {
    expect(p('thu 6pm')).toMatchObject({ day: '2026-11-12', dayWord: true, err: null });
    expect(p('next mon 6pm').day).toBe('2026-11-23');
    expect(p('tomorrow 6pm').day).toBe('2026-11-11');
  });
  it('no time typed yet: no minute and no error', () => {
    expect(p('')).toMatchObject({ minute: null, err: null });
  });
});

describe('date words and the calendar', () => {
  it('izRel follows the demo', () => {
    expect(izRel(FIRST, FIRST)).toBe('Today');
    expect(izRel(FIRST, '2026-11-11')).toBe('Tomorrow');
    expect(izRel(FIRST, '2026-11-12')).toBe('in 2 days');
    expect(izRel(FIRST, '2026-11-14')).toBe('Sat');
    expect(izRel(FIRST, '2026-11-17')).toBe('Next Tue');
    expect(izRel(FIRST, '2026-11-09')).toBe('Mon Nov 9');
  });
  it('rangeLabel within and across months, and empty without dates', () => {
    expect(rangeLabel(FIRST, LAST)).toBe('Nov 10 to 20');
    expect(rangeLabel('2026-11-30', '2026-12-04')).toBe('Nov 30 to Dec 4');
    expect(rangeLabel(null, LAST)).toBe('');
  });
  it('weeksOf gives Monday-start weeks covering the dates, at most ten', () => {
    const w = weeksOf(FIRST, LAST);
    expect(w.map((x) => x[0])).toEqual(['2026-11-09', '2026-11-16']);
    expect(w.every((x) => x.length === 7)).toBe(true);
    expect(weeksOf('2026-01-01', '2027-12-31')).toHaveLength(10);
    expect(weeksOf(LAST, FIRST)).toEqual([]);
  });
  it('pairText names the viewer as "You"', () => {
    const a = { id: 'a', name: 'Dana Mercer', initials: 'DM' };
    const b = { id: 'b', name: 'Keith Dawson', initials: 'KD' };
    expect(pairText([a, b], 'a')).toBe('You + Keith Dawson');
    expect(pairText([a, b], 'z')).toBe('Dana Mercer + Keith Dawson');
    expect(pairText([], 'a')).toBe('Not paired yet');
  });
});

describe('needsStage', () => {
  const base: Pick<InterviewsView, 'times' | 'bookings' | 'applicants' | 'booked' | 'caps'> = { times: [], bookings: [], applicants: 3, booked: 0, caps: capsFor(true, true, true) };
  const time = { id: 's', day: FIRST, minute: 1080, free: 2, opened: true, booking: null, heldBy: null };
  const pair = [
    { id: 'a', name: 'A', initials: 'A' },
    { id: 'b', name: 'B', initials: 'B' },
  ];
  it('links, then waiting, send, book, clear', () => {
    expect(needsStage({ ...base, times: [time], bookings: [{ id: 's', day: FIRST, minute: 1080, whenText: '', name: 'X', code: 'C', pair, link: null }] })).toBe('links');
    expect(needsStage(base)).toBe('waiting');
    expect(needsStage({ ...base, times: [{ ...time, opened: false }] })).toBe('send');
    expect(needsStage({ ...base, times: [time] })).toBe('book');
    expect(needsStage({ ...base, times: [time], booked: 3 })).toBe('clear');
  });
  it('a non-admin never sees the links stage', () => {
    expect(needsStage({ ...base, caps: NO_CAPS, times: [time], bookings: [{ id: 's', day: FIRST, minute: 1080, whenText: '', name: 'X', code: 'C', pair, link: null }] })).toBe('book');
  });
});

describe('mapLive', () => {
  const data: InterviewsData = {
    cycleId: 'cy1',
    sub: '',
    subPhone: '',
    endsLabel: '',
    done: 0,
    total: 2,
    upcoming: [
      {
        slotId: 's1',
        weekday: 'Tue',
        dayNum: '10',
        time: '6:00 PM',
        whenLine: 'Tue Nov 10, 6:00 PM',
        code: 'BTX-1',
        applicant: 'Sade Price',
        pair: [
          { userId: 'u-me', name: 'Dana Mercer', initials: 'DM' },
          { userId: 'u2', name: 'Keith Dawson', initials: 'KD' },
        ],
        mine: true,
        videoUrl: null,
        when: 'Today',
      },
    ],
    bookedCount: 2,
    applicantCount: 5,
    pairs: [],
    times: {
      cycleId: 'cy1',
      days: [
        {
          day: FIRST,
          label: '',
          times: [
            // 23:00Z on Nov 10 is 6:00 PM Eastern.
            { slotId: 's1', startsAt: '2026-11-10T23:00:00Z', time: '6:00 PM', freeCount: 2, opened: true, booked: true, bookedBy: 'Sade Price' },
            { slotId: 's2', startsAt: '2026-11-10T23:30:00Z', time: '6:30 PM', freeCount: 3, opened: true, booked: true, bookedBy: 'Tariq Wells' },
          ],
        },
        { day: LAST, label: '', times: [] },
      ],
      people: [
        { userId: 'u2', name: 'Keith Dawson', freeHours: 6, maxInterviews: null, sent: true },
        { userId: 'u-me', name: 'Dana Mercer', freeHours: 4, maxInterviews: 3, sent: true },
      ],
      applicants: 5,
      booked: 2,
      toEmail: 3,
      closedLine: '',
      openedLabel: 'Mon Nov 9',
      emailedCount: 5,
    },
    fair: { people: [{ userId: 'u3', name: 'Toby Faraday', interviews: 1, target: 1, maxInterviews: null, overBy: 0, sent: false }], interviews: 1, needsTwo: [] },
    isAdmin: true,
    failed: false,
    source: 'live',
  };
  const v = mapLive(data, FIRST, 'u-me');
  it('keeps DATE strings and Eastern minutes', () => {
    expect(v.times.map((t) => [t.day, t.minute])).toEqual([
      [FIRST, 1080],
      [FIRST, 1110],
    ]);
    expect([v.first, v.last]).toEqual([FIRST, LAST]);
  });
  it('a booked time with a ticket links to it; one without is held by name', () => {
    expect(v.times[0]).toMatchObject({ booking: 's1', heldBy: null });
    expect(v.times[1]).toMatchObject({ booking: null, heldBy: 'Tariq Wells' });
    expect(v.bookings[0]).toMatchObject({ id: 's1', day: FIRST, minute: 1080, name: 'Sade Price', link: null });
  });
  it('people: the viewer first, then the free-hours list, then fair-only people', () => {
    expect(v.people.map((p) => p.id)).toEqual(['u-me', 'u2', 'u3']);
    expect(v.people[0]).toMatchObject({ initials: 'DM', hours: 4, most: 3, interviews: 1 });
    expect(v.people[2]).toMatchObject({ hours: 0, sent: false, interviews: 1 });
  });
  it('live caps, no due day, no unbooked list without waiting data, and the sent line', () => {
    expect(v.caps).toEqual(capsFor(true, true, true));
    expect([v.unbooked, v.dueDay]).toEqual([null, null]);
    expect(v.sentLine).toBe('Sent to all 5 Mon Nov 9');
    expect(v.source).toBe('live');
  });
  it('a non-admin gets no caps', () => {
    expect(mapLive({ ...data, isAdmin: false }, FIRST, 'u-me').caps).toEqual(NO_CAPS);
  });
  it('"Needs cover" rides on the ticket', () => {
    const d2 = { ...data, upcoming: data.upcoming.map((u) => ({ ...u, needsCover: true })) };
    expect(mapLive(d2, FIRST, 'u-me').bookings[0].needsCover).toBe(true);
    expect(v.bookings[0].needsCover).toBeUndefined();
  });
  it('the students who have not booked: admins only', () => {
    const waiting = [{ applicationId: 'a1', name: 'Ana Ruiz', code: 'BTX-9', emailed: '2026-11-09T14:02:00Z', remindedToday: false }];
    expect(mapLive({ ...data, waiting }, FIRST, 'u-me').unbooked).toEqual([{ id: 'a1', name: 'Ana Ruiz', code: 'BTX-9', emailed: '2026-11-09T14:02:00Z', remindedToday: false }]);
    expect(mapLive({ ...data, waiting, isAdmin: false }, FIRST, 'u-me').unbooked).toBeNull();
  });
});

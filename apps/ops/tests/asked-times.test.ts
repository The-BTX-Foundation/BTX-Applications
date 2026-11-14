import { describe, expect, it, vi } from 'vitest';
import { askedCountOrNull, askedTitle, countAsked, groupAsked, type AskedSlot, type FreeTimesRead } from '@/lib/asked-times';
import { failedView, mapLive } from '@/lib/interviews-map';
import type { InterviewsData } from '@/lib/interviews';
import { INTERVIEWS_VIEW, INTERVIEWS_VIEW_EMPTY, INTERVIEWS_VIEW_STRESS } from '@/mock/interviews-view';
import { TODAY_VIEW, TODAY_VIEW_EMPTY } from '@/mock/today-view';

const NOW = new Date('2026-11-12T17:00:00Z');
const apps = [
  { id: 'a1', name: 'Ada Okafor', code: 'APP-1' },
  { id: 'a2', name: 'Lena Mensah', code: 'APP-2' },
  { id: 'a3', name: 'Naomi Brooks', code: 'APP-3' },
  { id: 'a4', name: '', code: 'APP-4' },
];
const row = (id: string, ranges: unknown, at: string, extra: Partial<FreeTimesRead> = {}): FreeTimesRead => ({ application_id: id, ranges, said: 'after labs', days: null, windows: null, note: null, created_at: at, updated_at: null, ...extra });
// Mon Nov 16: 5:00 PM (fits 5 to 6), 5:30 PM (fits), 6:00 PM (does not: the range ends at 6); one booked; one already past.
const slots: AskedSlot[] = [
  { id: 's1', startsAt: '2026-11-16T22:00:00Z', endsAt: '2026-11-16T22:30:00Z', opened: true, booked: false },
  { id: 's2', startsAt: '2026-11-16T22:30:00Z', endsAt: '2026-11-16T23:00:00Z', opened: false, booked: false },
  { id: 's3', startsAt: '2026-11-16T23:00:00Z', endsAt: '2026-11-16T23:30:00Z', opened: true, booked: false },
  { id: 's4', startsAt: '2026-11-16T22:15:00Z', endsAt: '2026-11-16T22:45:00Z', opened: true, booked: true },
  { id: 's5', startsAt: '2026-11-10T22:00:00Z', endsAt: '2026-11-10T22:30:00Z', opened: true, booked: false },
];
const MON = [{ day: '2026-11-16', start: '17:00', end: '18:00' }];

describe('groupAsked', () => {
  it('lists a student with a free-times row and no booking, with her ranges as Eastern lines and the times that fit', () => {
    const out = groupAsked(apps, new Set(), [row('a1', MON, '2026-11-11T02:14:00Z')], slots, NOW);
    expect(out).toEqual([
      {
        id: 'a1',
        name: 'Ada Okafor',
        code: 'APP-1',
        said: 'after labs',
        lines: ['Mon Nov 16, 5:00 to 6:00 PM'],
        sent: '2026-11-11T02:14:00Z',
        fits: [
          { id: 's1', label: 'Mon Nov 16, 5:00 PM', opened: true },
          { id: 's2', label: 'Mon Nov 16, 5:30 PM', opened: false },
        ],
      },
    ]);
  });
  it('leaves out a student who has booked, and a student with no row', () => {
    const out = groupAsked(apps, new Set(['a1']), [row('a1', MON, '2026-11-11T00:00:00Z')], slots, NOW);
    expect(out).toEqual([]);
  });
  it('still lists a student who sent times after the booking deadline (the deadline stops new answers, not the list)', () => {
    // An exempt student's row written after the deadline (the grouping never looks at the deadline).
    const out = groupAsked(apps, new Set(), [row('a2', MON, '2026-11-12T16:00:00Z')], slots, NOW);
    expect(out.map((a) => a.id)).toEqual(['a2']);
  });
  it('orders the oldest request first and uses the latest change as "sent"', () => {
    const out = groupAsked(apps, new Set(), [row('a1', MON, '2026-11-11T00:00:00Z', { updated_at: '2026-11-12T00:00:00Z' }), row('a3', MON, '2026-11-11T12:00:00Z')], slots, NOW);
    expect(out.map((a) => [a.id, a.sent])).toEqual([
      ['a3', '2026-11-11T12:00:00Z'],
      ['a1', '2026-11-12T00:00:00Z'],
    ]);
  });
  it('shows an older days-and-parts answer as one line with no fits, and the code when there is no name', () => {
    const out = groupAsked(apps, new Set(), [row('a4', [], '2026-11-11T00:00:00Z', { said: null, note: 'evenings', days: ['Mon', 'Wed'], windows: ['evening'] })], slots, NOW);
    expect(out[0]).toMatchObject({ name: 'APP-4', said: 'evenings', lines: ['Mon, Wed · evening'], fits: [] });
  });
});

describe('countAsked and the title', () => {
  it('counts submitted students with a row and no active booking', () => {
    expect(countAsked(['a1', 'a2', 'a3'], new Set(['a2']), new Set(['a1', 'a2', 'x']))).toBe(1);
  });
  it('says student or students', () => {
    expect(askedTitle(1)).toBe('1 student asked for other times');
    expect(askedTitle(3)).toBe('3 students asked for other times');
  });
});

describe('the view', () => {
  const data = (asked: InterviewsData['asked']): InterviewsData => ({ cycleId: 'c1', sub: '', subPhone: '', endsLabel: '', done: 0, total: 0, upcoming: [], bookedCount: 0, applicantCount: 0, pairs: [], times: null, fair: null, isAdmin: false, failed: false, source: 'live', asked });
  it('passes the list through for board members without admin rights too, keeps a failed read as null', () => {
    const list = groupAsked(apps, new Set(), [row('a1', MON, '2026-11-11T00:00:00Z')], slots, NOW);
    expect(mapLive(data(list), '2026-11-12', 'u1').asked).toEqual(list);
    expect(mapLive(data(null), '2026-11-12', 'u1').asked).toBeNull();
    expect(failedView('live', '2026-11-12').asked).toBeNull();
  });
  it('mock samples: two waiting (one with a fitting time), many in stress, none in empty', () => {
    expect(INTERVIEWS_VIEW.asked?.map((a) => a.name)).toEqual(['Jalen Thomas', 'Renee Simmons']);
    expect(INTERVIEWS_VIEW.asked?.[0].fits.length).toBeGreaterThan(0);
    expect(INTERVIEWS_VIEW_STRESS.asked?.length).toBe(6);
    expect(INTERVIEWS_VIEW_EMPTY.asked).toEqual([]);
    expect(TODAY_VIEW.askedOtherTimes).toBe(2);
    expect(TODAY_VIEW_EMPTY.askedOtherTimes).toBe(0);
  });
});

describe('askedCountOrNull (Today)', () => {
  const read = async () => ['a1', 'a2'];
  it('counts students with a row and no active booking', async () => {
    expect(await askedCountOrNull([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }], [{ application_id: 'a2' }], read)).toBe(1);
  });
  it('is null (card hidden) when the submitted or bookings read failed, never a guessed number', async () => {
    const spy = vi.fn(read);
    expect(await askedCountOrNull(null, [], spy)).toBeNull();
    expect(await askedCountOrNull([{ id: 'a1' }], null, spy)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
  it('is null when the free-times read throws, and 0 with nobody submitted', async () => {
    expect(await askedCountOrNull([{ id: 'a1' }], [], async () => { throw new Error('x'); })).toBeNull();
    expect(await askedCountOrNull([], [], read)).toBe(0);
  });
});

describe('repeated ranges', () => {
  it('show once (no duplicate lines or keys)', () => {
    const out = groupAsked(apps, new Set(), [row('a1', [...MON, ...MON], '2026-11-11T00:00:00Z')], slots, NOW);
    expect(out[0].lines).toEqual(['Mon Nov 16, 5:00 to 6:00 PM']);
  });
});

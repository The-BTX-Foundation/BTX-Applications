// The refreshed Interviews page's write safety (Ops Hub refresh review, 2026-11-12): the server-message classifier (a tick
// only with no failure part), the no-answer words, confirm arming against a held Enter, the preview comparisons that stop
// a confirm when things changed, the time limit on every live call, and the gate that runs one write at a time and stays
// locked until fresh data lands. Also the Eastern-time mapping across daylight time and a non-admin's hidden links.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/actions/interviews', () => ({}));

import { createGate, settle, type Answer } from '@/components/interviews/interviews-writes';
import type { InterviewsData } from '@/lib/interviews';
import { ARM_MS, armed, goKey, lateText, linksGo, linksSig, mapLive, movesSig, NO_ANSWER, NO_ANSWER_SENT, noteOk, pairSig } from '@/lib/interviews-map';

describe('noteOk (tick only with no failure part)', () => {
  it('all-good messages get a tick', () => {
    for (const m of ['Saved 1 link. The student and both interviewers got the link by email.', 'Reminder sent to 3 board members.', 'Moved 2 interviews.', 'Paired 4 interviews.']) expect(noteOk(m)).toBe(true);
  });
  it('part-failures get an alert, straight or curly apostrophes', () => {
    for (const m of [
      "Saved 1 link. Email isn't set up here, so no emails went out.",
      'Saved 3 links. 2 didn’t go; save again to try those once more.',
      "Made 4 links. 1 of the links didn't work. Press Make Teams links again to try it.",
      "2 reminders didn't go. Try again.",
      'Couldn’t reach Teams.',
    ])
      expect(noteOk(m)).toBe(false);
  });
});

describe('no-answer words', () => {
  it('sending actions warn that some may have gone out', () => {
    expect(lateText(true)).toBe('No answer in time. Reload to check. Some emails or meetings may already have gone out.');
    expect(lateText(true)).toBe(NO_ANSWER_SENT);
    expect(lateText(false)).toBe(NO_ANSWER);
  });
});

describe('confirm arming (held Enter, double click)', () => {
  it('arms only after ARM_MS', () => {
    expect(ARM_MS).toBe(400);
    expect(armed(1000, 1399)).toBe(false);
    expect(armed(1000, 1400)).toBe(true);
  });
  it('a repeated or too-early keydown is blocked; a fresh armed keydown waits for keyup', () => {
    expect(goKey('down', true, false, true)).toBe('block');
    expect(goKey('down', false, false, false)).toBe('block');
    expect(goKey('down', false, false, true)).toBe('wait');
  });
  it('keyup acts only after a keydown on the same button', () => {
    expect(goKey('up', false, false, true)).toBe('block');
    expect(goKey('up', false, true, true)).toBe('go');
    expect(goKey('up', false, true, false)).toBe('block');
  });
});

describe('preview comparisons and the links go button', () => {
  it('signatures change when the preview changes, not on order', () => {
    expect(linksSig({ toMake: 2, replacing: 0, handCheck: 1, toEmail: 0 })).not.toBe(linksSig({ toMake: 3, replacing: 0, handCheck: 1, toEmail: 0 }));
    const a = [
      { slotId: 's1', from: 'u1', to: 'u2' },
      { slotId: 's2', from: 'u3', to: 'u4' },
    ];
    expect(movesSig(a)).toBe(movesSig([...a].reverse()));
    expect(movesSig(a)).not.toBe(movesSig([{ ...a[0], to: 'u5' }, a[1]]));
    expect(pairSig({ unpaired: 2, wouldPair: 2, uncovered: 0 })).not.toBe(pairSig({ unpaired: 2, wouldPair: 1, uncovered: 1 }));
  });
  it('make links, else send the emails, else nothing', () => {
    expect(linksGo({ toMake: 1, toEmail: 0 })).toBe('Make 1 Teams link');
    expect(linksGo({ toMake: 3, toEmail: 2 })).toBe('Make 3 Teams links');
    expect(linksGo({ toMake: 0, toEmail: 2 })).toBe('Send the emails');
    expect(linksGo({ toMake: 0, toEmail: 0 })).toBeNull();
  });
});

describe('settle (time limit)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('ok and refused answers pass through', async () => {
    await expect(settle(Promise.resolve({ ok: true, message: 'Done.' }), 1000)).resolves.toEqual({ kind: 'ok', value: { ok: true, message: 'Done.' } });
    await expect(settle(Promise.resolve({ ok: false, message: 'Admins only.' }), 1000)).resolves.toEqual({ kind: 'refused', message: 'Admins only.' });
  });
  it('no answer in time is late', async () => {
    const p = settle(new Promise<{ ok: boolean; message: string }>(() => {}), 1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toEqual({ kind: 'late' });
  });
  it('a thrown call is late too (it may have run)', async () => {
    await expect(settle(Promise.reject(new Error('net')), 1000)).resolves.toEqual({ kind: 'late' });
  });
});

describe('createGate', () => {
  const ok = (): Promise<Answer<{ ok: true; message: string }>> => Promise.resolve({ kind: 'ok', value: { ok: true, message: 'Done.' } });
  it('a double click calls once; the second press is locked', async () => {
    const g = createGate(() => {});
    const fn = vi.fn(ok);
    const [a, b] = await Promise.all([g.run('k', fn, { write: true, sends: true }), g.run('k', fn, { write: true, sends: true })]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a.kind).toBe('ok');
    expect(b.kind).toBe('locked');
  });
  it('after a write it stays locked (stale) until fresh data lands', async () => {
    const g = createGate(() => {});
    await g.run('k', ok, { write: true, sends: false });
    expect(g.locked()).toBe(true);
    const fn = vi.fn(ok);
    expect((await g.run('k2', fn, { write: true, sends: false })).kind).toBe('locked');
    expect(fn).not.toHaveBeenCalled();
    g.landed();
    expect(g.locked()).toBe(false);
    expect((await g.run('k2', fn, { write: true, sends: false })).kind).toBe('ok');
  });
  it('a refusal returns its reason and still stays stale until refresh', async () => {
    const g = createGate(() => {});
    const r = await g.run('k', () => Promise.resolve({ kind: 'refused', message: 'Admins only.' } as const), { write: true, sends: true });
    expect(r).toEqual({ kind: 'fail', message: 'Admins only.' });
    expect(g.locked()).toBe(true);
  });
  it('a late sending write says some may have gone out; a late read says reload', async () => {
    const g = createGate(() => {});
    expect(await g.run('k', () => Promise.resolve({ kind: 'late' } as const), { write: true, sends: true })).toEqual({ kind: 'fail', message: NO_ANSWER_SENT });
    g.landed();
    expect(await g.run('p', () => Promise.resolve({ kind: 'late' } as const), { write: false, sends: false })).toEqual({ kind: 'fail', message: NO_ANSWER });
  });
  it('a read (preview) does not lock afterwards', async () => {
    const g = createGate(() => {});
    await g.run('p', ok, { write: false, sends: false });
    expect(g.locked()).toBe(false);
  });
  it('reports busy while running', async () => {
    const states: (string | null)[] = [];
    const g = createGate((s) => states.push(s.busy));
    await g.run('k', ok, { write: false, sends: false });
    expect(states).toEqual(['k', null]);
  });
});

describe('mapLive: Eastern time across daylight time, and hidden links', () => {
  const person = (userId: string, name: string) => ({ userId, name, initials: name.split(' ').map((w) => w[0]).join('') });
  const row = (slotId: string, startsAt: string, pair: ReturnType<typeof person>[], videoUrl: string | null) => ({
    upcoming: { slotId, weekday: '', dayNum: '', time: '', whenLine: '', code: '', applicant: `Applicant ${slotId}`, pair, mine: false, videoUrl, when: '' },
    time: { slotId, startsAt, time: '', freeCount: 2, opened: true, booked: true, bookedBy: `Applicant ${slotId}` },
  });
  const me = person('u-me', 'Dana Mercer');
  const other = [person('u2', 'Keith Dawson'), person('u3', 'Toby Faraday')];
  const rows = [
    // Oct 30 is still daylight time (EDT, UTC-4): 22:00Z is 6:00 PM.
    row('edt', '2026-10-30T22:00:00Z', [me, other[0]], 'https://teams.microsoft.com/l/meetup-join/mine'),
    // Nov 12, 7:00 PM EST (UTC-5) is stored as 00:00Z on Nov 13.
    row('est', '2026-11-13T00:00:00Z', other, 'https://teams.microsoft.com/l/meetup-join/theirs'),
  ];
  const data = (isAdmin: boolean): InterviewsData => ({
    cycleId: 'cy1',
    sub: '',
    subPhone: '',
    endsLabel: '',
    done: 0,
    total: 2,
    upcoming: rows.map((r) => r.upcoming),
    bookedCount: 2,
    applicantCount: 2,
    pairs: [],
    times: {
      cycleId: 'cy1',
      days: [
        { day: '2026-10-30', label: '', times: [rows[0].time] },
        { day: '2026-11-12', label: '', times: [rows[1].time] },
      ],
      people: [],
      applicants: 2,
      booked: 2,
      toEmail: 0,
      closedLine: '',
      openedLabel: null,
      emailedCount: 0,
    },
    fair: { people: [], interviews: 2, needsTwo: [] },
    isAdmin,
    failed: false,
    source: 'live',
  });
  it('a daylight-time date and a 7 PM EST time land on the right day and minute', () => {
    const v = mapLive(data(true), '2026-10-30', 'u-me');
    const at = (id: string) => v.bookings.find((b) => b.id === id);
    expect([at('edt')?.day, at('edt')?.minute]).toEqual(['2026-10-30', 18 * 60]);
    expect([at('est')?.day, at('est')?.minute]).toEqual(['2026-11-12', 19 * 60]);
  });
  it('a non-admin keeps their own link; other pairs’ links are stripped and marked hidden', () => {
    const v = mapLive(data(false), '2026-10-30', 'u-me');
    const at = (id: string) => v.bookings.find((b) => b.id === id);
    expect(at('edt')?.link).toBe('https://teams.microsoft.com/l/meetup-join/mine');
    expect(at('est')?.link).toBeNull();
    expect(at('est')?.linkHidden).toBe(true);
    expect(JSON.stringify(v)).not.toContain('meetup-join/theirs');
  });
  it('an admin sees every link', () => {
    const v = mapLive(data(true), '2026-10-30', 'u-me');
    expect(v.bookings.find((b) => b.id === 'est')?.link).toBe('https://teams.microsoft.com/l/meetup-join/theirs');
  });
});

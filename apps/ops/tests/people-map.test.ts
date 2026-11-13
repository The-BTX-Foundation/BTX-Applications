import { describe, expect, it } from 'vitest';
import {
  areaOf, canChangeRole, changedLine, cnt, draftNudge, initials, isOld, lastWord, mapPeople, mapWork, offeredRole,
  calloutPerson, canStartRole, nudgeBox, peopleDemo, settleRole, shownRole, staleOf, startRole, summary, takeIn, taskCount,
  NO_ROLE_CHANGES, NO_WORK, type NudgeSend, type RoleState,
} from '@/lib/people-map';
import type { PeoplePerson, PeopleWork } from '@/lib/people-view';

const P = (id: string, name: string, lastDay: string | null, role: 'admin' | 'board' = 'board'): PeoplePerson => ({ id, name, initials: initials(name), title: null, role, lastDay, nameIsEmail: name.includes('@') });
const T = '2026-11-10';

describe('mapPeople', () => {
  it('joins profiles to the directory, keeps profile order, skips non-staff and missing rows', () => {
    const out = mapPeople(
      [{ user_id: 'b', display_name: 'Keith Dawson', initials: '', title: 'President' }, { user_id: 'a', display_name: 'Dana Mercer', initials: 'DM' }, { user_id: 'x', display_name: 'Ghost' }, { user_id: 'y', display_name: 'Applicant' }],
      [{ user_id: 'a', role: 'admin', last_sign_in_at: '2026-11-10T14:00:00Z' }, { user_id: 'b', role: 'board', last_sign_in_at: null }, { user_id: 'y', role: 'applicant' }],
    );
    expect(out.map((p) => p.id)).toEqual(['b', 'a']);
    expect(out[0]).toMatchObject({ initials: 'KD', title: 'President', role: 'board', lastDay: null });
    expect(out[1]).toMatchObject({ role: 'admin', lastDay: '2026-11-10' });
  });
  it('turns a late-evening UTC sign-in into the Eastern day', () => {
    expect(mapPeople([{ user_id: 'a', display_name: 'A B' }], [{ user_id: 'a', role: 'board', last_sign_in_at: '2026-11-10T03:00:00Z' }])[0].lastDay).toBe('2026-11-09');
  });
});

describe('mapWork', () => {
  const people = [P('a', 'Ada Bee', T), P('b', 'Bo Cee', T)];
  it('lists open tasks soonest first (five), counts the rest, ignores closed and archived', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, area: 'finance', status: 'open', due_on: `2026-11-${20 - i}`, archived: false }));
    tasks.push({ id: 'done', title: 'Done', area: 'x', status: 'done', due_on: '2026-11-01', archived: false });
    tasks.push({ id: 'arch', title: 'Arch', area: 'x', status: 'open', due_on: '2026-11-01', archived: true });
    const assignees = [...tasks.map((t) => ({ task_id: t.id, user_id: 'a' })), { task_id: 't0', user_id: 'a' }];
    const w = mapWork(people, tasks, assignees, [], '2026-11-10T12:00:00Z');
    expect(w.a.tasks.map((t) => t.id)).toEqual(['t6', 't5', 't4', 't3', 't2']);
    expect(w.a.more).toBe(2);
    expect(w.a.tasks[0]).toMatchObject({ area: 'Finance', icon: 'money' });
    expect(w.b).toEqual(NO_WORK);
    expect(taskCount(w.a)).toBe(7);
  });
  it('keeps only interviews ahead, with the pair mate', () => {
    const booked = [
      { slotId: 's1', code: 'APP-1', name: 'Ada Okafor', startsAt: '2026-11-12T22:30:00Z', interviewerA: 'a', interviewerB: 'b' },
      { slotId: 's0', code: 'APP-0', name: 'Past', startsAt: '2026-11-09T22:30:00Z', interviewerA: 'a', interviewerB: 'b' },
    ];
    const w = mapWork(people, [], [], booked, '2026-11-10T12:00:00Z');
    expect(w.a.interviews).toEqual([{ id: 's1', applicant: 'Ada Okafor', code: 'APP-1', day: '2026-11-12', time: '5:30 PM', mateId: 'b' }]);
    expect(w.b.interviews[0].mateId).toBe('a');
  });
});

describe('words', () => {
  it('lastWord', () => {
    expect(lastWord(T, null)).toBe('Invited');
    expect(lastWord(T, T)).toBe('Today');
    expect(lastWord(T, '2026-11-09')).toBe('Yesterday');
    expect(lastWord(T, '2026-11-06')).toBe('Fri');
    expect(lastWord(T, '2026-10-02')).toBe('Oct 2');
  });
  it('isOld at three days', () => {
    expect(isOld(T, '2026-11-08')).toBe(false);
    expect(isOld(T, '2026-11-07')).toBe(true);
    expect(isOld(T, null)).toBe(false);
  });
  it('summary, cnt, areaOf, changedLine, offeredRole', () => {
    expect(summary([{ role: 'admin' }, { role: 'board' }])).toBe('2 · 1 with admin rights');
    expect(cnt(120)).toBe('99+');
    expect(areaOf('newthing')).toEqual({ name: 'Newthing', icon: null });
    expect(changedLine('Keith Dawson', 'admin', false)).toBe('Keith Dawson now has admin rights');
    expect(changedLine('Keith Dawson', 'admin', true)).toBe('Keith Dawson has admin rights again');
    expect(changedLine('Keith Dawson', 'board', false)).toBe('Keith Dawson no longer has admin rights');
    expect(offeredRole('board')).toBe('admin');
  });
});

describe('staleOf', () => {
  it('names the longest away (3+ days), never the viewer or an invited account', () => {
    const ps = [P('me', 'Me Me', '2026-11-01'), P('a', 'A A', '2026-11-07'), P('b', 'B B', '2026-11-06'), P('c', 'C C', null)];
    expect(staleOf(ps, 'me', T)?.id).toBe('b');
    expect(staleOf([P('me', 'Me', '2026-11-01'), P('a', 'A A', '2026-11-08')], 'me', T)).toBeNull();
  });
  it('ties keep list order', () => {
    expect(staleOf([P('a', 'A A', '2026-11-06'), P('b', 'B B', '2026-11-06')], 'me', T)?.id).toBe('a');
  });
});

describe('draftNudge', () => {
  const opts = { me: 'me', today: T, interviewsStart: T, nameOf: (id: string) => (id === 'pn' ? 'Priya Natarajan' : null) };
  const iv = { id: 's', applicant: 'Sade Price', code: 'APP-15', day: '2026-11-17', time: '5:00 PM', mateId: 'pn' };
  const w = (x: Partial<PeopleWork>): PeopleWork => ({ ...NO_WORK, ...x });
  const p = P('ds', 'Dorian Sutton', '2026-11-06');
  it('interview on the start day', () => {
    expect(draftNudge(p, w({ interviews: [iv] }), opts)).toBe('Hi Dorian, interviews started today. Yours is Sade Price, Tue Nov 17 at 5:00 PM, with Priya Natarajan.');
    expect(draftNudge(p, w({ interviews: [iv] }), { ...opts, interviewsStart: null })).toBe('Hi Dorian, your first interview is Sade Price, Tue Nov 17 at 5:00 PM, with Priya Natarajan.');
  });
  it('task first, then the interview; the viewer is "me"', () => {
    const t = { id: 't', title: 'Announce it', area: 'Outreach', icon: 'mega' as const, dueOn: '2026-11-03', note: null, waitsOn: null };
    expect(draftNudge(p, w({ tasks: [t], interviews: [{ ...iv, mateId: 'me' }] }), opts)).toBe('Hi Dorian, a reminder that "Announce it" is due Tue Nov 3. Your first interview is Sade Price, Tue Nov 17 at 5:00 PM, with me.');
  });
  it('a waiting ask wins; nothing open is a check-in', () => {
    const t = { id: 't', title: 'x', area: '', icon: null, dueOn: null, note: null, waitsOn: null, ask: 'Could you send it?' };
    expect(draftNudge(p, w({ waiting: [t] }), opts)).toBe('Could you send it?');
    expect(draftNudge(p, NO_WORK, opts)).toBe('Hi Dorian, checking in.');
  });
});

describe('guards', () => {
  it('canChangeRole: admin only, never self, only where the write exists', () => {
    expect(canChangeRole('admin', 'me', 'kd', true)).toBe(true);
    expect(canChangeRole('board', 'me', 'kd', true)).toBe(false);
    expect(canChangeRole('admin', 'me', 'me', true)).toBe(false);
    expect(canChangeRole('admin', 'me', 'kd', false)).toBe(false);
  });
  it('peopleDemo flags are mock-only', () => {
    expect(peopleDemo('failsend', false)).toEqual({ failSend: true, failRole: false });
    expect(peopleDemo('failrole', true)).toEqual({ failSend: false, failRole: false });
  });
});

describe('the board role state (what people-board.tsx draws through)', () => {
  const kd = { id: 'kd', role: 'board' as const, nameIsEmail: false };
  it('a row never shows the pending role before the server answers', () => {
    const s = startRole(NO_ROLE_CHANGES, 'kd', 'admin', 1);
    expect(shownRole(s, kd)).toBe('board');
    expect(shownRole(settleRole(s, 'kd', 1, { ok: true }).state, kd)).toBe('admin');
    expect(shownRole(settleRole(s, 'kd', 1, { ok: false }).state, kd)).toBe('board');
  });
  it('a second change on the same person is refused while one is saving; another person is not blocked', () => {
    const s = startRole(NO_ROLE_CHANGES, 'kd', 'admin', 1);
    expect(canStartRole(NO_ROLE_CHANGES, 'admin', 'me', kd, true)).toBe(true);
    expect(canStartRole(s, 'admin', 'me', kd, true)).toBe(false);
    expect(canStartRole(s, 'admin', 'me', { id: 'ds', nameIsEmail: false }, true)).toBe(true);
    expect(canStartRole(settleRole(s, 'kd', 1, { ok: true }).state, 'admin', 'me', kd, true)).toBe(true);
  });
  it('no role control for a viewer without admin rights, on their own row, on an invited address, or without the write', () => {
    expect(canStartRole(NO_ROLE_CHANGES, 'board', 'me', kd, true)).toBe(false);
    expect(canStartRole(NO_ROLE_CHANGES, 'admin', 'kd', kd, true)).toBe(false);
    expect(canStartRole(NO_ROLE_CHANGES, 'admin', 'me', { id: 'x', nameIsEmail: true }, true)).toBe(false);
    expect(canStartRole(NO_ROLE_CHANGES, 'admin', 'me', kd, false)).toBe(false);
  });
  it('new data is taken in only when no change is saving and no refresh is pending', () => {
    const done: RoleState = { over: { kd: 'admin' }, pending: {} };
    // Saving or refreshing: the loaded data may predate the change, so the confirmed role stays drawn.
    expect(takeIn(done, 1, false)).toBe(done);
    expect(takeIn(done, 0, true)).toBe(done);
    expect(shownRole(takeIn(done, 1, false), kd)).toBe('admin');
    // Settled: the loaded data is the truth (the server's role, here still board after a change made elsewhere).
    const settled = takeIn(done, 0, false);
    expect(settled.over).toEqual({});
    expect(shownRole(settled, kd)).toBe('board');
    expect(takeIn(NO_ROLE_CHANGES, 0, false)).toBe(NO_ROLE_CHANGES);
  });
  it('a refusal or a timeout drops the override, so the loaded role shows; the next settled refresh shows the server role', () => {
    const before: RoleState = { over: { kd: 'admin' }, pending: {} };
    const refused = settleRole(startRole(before, 'kd', 'board', 2), 'kd', 2, { ok: false });
    expect(refused.outcome).toBe('refused');
    expect(shownRole(refused.state, { ...kd, role: 'admin' })).toBe('admin');
    const late = settleRole(startRole(NO_ROLE_CHANGES, 'kd', 'admin', 3), 'kd', 3, { ok: false, unknown: true });
    expect(late.outcome).toBe('unknown');
    expect(shownRole(late.state, kd)).toBe('board');
    // The change did save after all: the refresh's data says admin, and that is what the row draws.
    expect(shownRole(takeIn(late.state, 0, false), { ...kd, role: 'admin' })).toBe('admin');
  });
  it('give, Undo, then give again: each settles to its own role', () => {
    let s = settleRole(startRole(NO_ROLE_CHANGES, 'kd', 'admin', 1), 'kd', 1, { ok: true }).state;
    s = startRole(s, 'kd', 'board', 2);
    expect(shownRole(s, kd)).toBe('admin');
    s = settleRole(s, 'kd', 2, { ok: true }).state;
    expect(shownRole(s, kd)).toBe('board');
    s = settleRole(startRole(s, 'kd', 'admin', 3), 'kd', 3, { ok: true }).state;
    expect(shownRole(s, kd)).toBe('admin');
  });
});

describe('calloutPerson (the gold callout stays with the person it was used for)', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  it('pinned to A, a refresh making B the longest away keeps A; A leaving the list falls back to B', () => {
    expect(calloutPerson(null, b, [a, b])).toBe(b);
    expect(calloutPerson('a', b, [a, b])).toBe(a);
    expect(calloutPerson('a', b, [b])).toBe(b);
    expect(calloutPerson('a', null, [b])).toBe(null);
  });
});

describe('nudgeBox (the gold callout, read by the person it is about)', () => {
  it('a refresh that changes the stale person starts the callout clean', () => {
    const sends: Record<string, NudgeSend> = { kd: { sent: '9:15 AM' } };
    expect(nudgeBox('kd', sends, null)).toMatchObject({ state: 'sent', at: '9:15 AM', to: 'kd' });
    // The refresh now puts Dorian in the callout: Keith's "Sent" does not show for Dorian, and Send goes to Dorian.
    expect(nudgeBox('ds', sends, 'kd')).toEqual({ state: 'idle', at: '', editing: false, to: 'ds' });
  });
  it('Retry shows only where that person\'s send failed in the callout; a row failure does not', () => {
    expect(nudgeBox('kd', { kd: { failed: 'needs' } }, 'kd')).toMatchObject({ state: 'failed', editing: true, to: 'kd' });
    expect(nudgeBox('kd', { kd: { failed: 'row' } }, null).state).toBe('idle');
    expect(nudgeBox('ds', { kd: { failed: 'needs' } }, null).state).toBe('idle');
  });
  it('one send per person across both controls: a row send in flight or saved shows in the callout', () => {
    expect(nudgeBox('kd', { kd: { sending: true } }, null).state).toBe('sending');
    expect(nudgeBox('kd', { kd: { sent: '9:20 AM' } }, null).state).toBe('sent');
  });
});

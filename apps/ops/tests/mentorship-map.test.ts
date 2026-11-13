// The Mentorship page's pure logic (lib/mentorship-map.ts): live rows mapped to steps and messages, the step that is now,
// the news card and the sentence read after a tick, the step words, local ticks, the paged read and the per-step queue.
import { describe, expect, it } from 'vitest';
import { chain, dayWord, headline, initialsFrom, mapMessages, mapSteps, mockClock, newsFor, nextStep, openStatus, pageRows, progress, settleTick, shownStatus, statusFor, statusWord, stepsSig, stepWord, withTicks } from '@/lib/mentorship-map';
import { MS_VIEW, MS_VIEW_STRESS } from '@/mock/mentorship-view';

const TODAY = '2026-11-10';

describe('statusWord', () => {
  it('words each program status; unknown or missing reads as planned', () => {
    expect(statusWord('active')).toBe('Active');
    expect(statusWord('setting_up')).toBe('Setting up');
    expect(statusWord(null)).toBe('Not active yet');
    expect(statusWord('weird')).toBe('Not active yet');
  });
});

describe('mapSteps', () => {
  const tasks = [
    { id: 'b', title: 'Second', note: null, due_on: '2026-12-31T00:00:00', status: 'in_progress', type: 'task', position: 2, assignee_group: null },
    { id: 'a', title: 'First', note: 'A note', due_on: null, status: 'done', type: 'task', position: 1, assignee_group: null },
    { id: 'c', title: 'Group owned', note: null, due_on: null, status: 'open', type: 'approval', position: 3, assignee_group: 'board' },
    { id: 'd', title: 'Person owned', note: null, due_on: null, status: 'open', type: 'task', position: 3, assignee_group: null },
  ];
  const steps = mapSteps(tasks, [{ task_id: 'd', user_id: 'u1' }]);
  it('orders by position, then id', () => expect(steps.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']));
  it('maps done, due (day only), note and the reopen status', () => {
    expect(steps[0]).toMatchObject({ done: true, sub: 'A note', reopenAs: 'open', unassigned: false });
    expect(steps[1]).toMatchObject({ done: false, due: '2026-12-31', reopenAs: 'in_progress', unassigned: true });
  });
  it('a group or a person owns a step; approvals are marked', () => {
    expect(steps[2]).toMatchObject({ unassigned: false, approval: true });
    expect(steps[3]).toMatchObject({ unassigned: false, approval: false, share: false });
  });
});

describe('messages', () => {
  it('words the day', () => {
    expect(dayWord(TODAY, TODAY)).toBe('Today');
    expect(dayWord(TODAY, '2026-11-09')).toBe('Yesterday');
    expect(dayWord(TODAY, '2026-11-04')).toBe('Wed Nov 4');
  });
  it('makes initials', () => {
    expect(initialsFrom('Toby Faraday')).toBe('TF');
    expect(initialsFrom('Cher')).toBe('C');
    expect(initialsFrom('')).toBe('?');
  });
  it('orders oldest first and names the bot, the viewer and unknown people', () => {
    const staff = new Map([['u2', { name: 'Toby Faraday', initials: 'TF' }]]);
    const rows = [
      { id: 'm3', author_id: 'u9', is_bot: false, body: 'Who?', created_at: '2026-11-10T14:00:00Z' },
      { id: 'm2', author_id: 'me', is_bot: false, body: 'Mine', created_at: '2026-11-10T13:40:00Z' },
      { id: 'm1', author_id: null, is_bot: true, body: 'Bot', created_at: '2026-11-09T21:00:00Z' },
      { id: 'm0', author_id: 'u2', is_bot: false, body: 'Toby', created_at: '2026-11-09T21:00:00Z' },
    ];
    const ms = mapMessages(rows, staff, { userId: 'me', initials: 'DM' }, TODAY);
    expect(ms.map((m) => m.id)).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(ms[0]).toMatchObject({ who: 'Toby Faraday', initials: 'TF', day: 'Yesterday', time: '4:00 PM' });
    expect(ms[1]).toMatchObject({ who: 'BTX', bot: true });
    expect(ms[2]).toMatchObject({ who: 'You', mine: true, initials: 'DM', day: 'Today', time: '8:40 AM' });
    expect(ms[3]).toMatchObject({ who: 'Board member', initials: 'BM' });
  });
});

describe('the step that is now, the news and the headline', () => {
  const steps = MS_VIEW.steps;
  it('finds the next step and the progress', () => {
    expect(nextStep(steps)?.id).toBe('m3');
    expect(progress(steps)).toEqual({ done: 2, total: 5 });
  });
  it('news: gold share step, shared, plain next, no owner, none', () => {
    expect(newsFor(steps, false, true)).toEqual({ id: 'm3', kicker: 'Next · step 3', title: 'Recruit mentors', icon: 'share', gold: true });
    expect(newsFor(steps, true, true)).toMatchObject({ kicker: 'Application shared', icon: 'share', gold: false });
    expect(newsFor(steps, false, false)).toMatchObject({ kicker: 'Next · step 3', icon: 'flag', gold: false });
    expect(newsFor(MS_VIEW_STRESS.steps, false, true)).toMatchObject({ kicker: 'No owner yet', icon: 'people', gold: true });
    expect(newsFor([], false, true)).toBeNull();
    expect(newsFor(withTicks(steps, { m3: true, m4: true, m5: true }), false, true)).toBeNull();
  });
  it('headline', () => {
    expect(headline([], false, true)).toBe('The mentorship program has no steps yet.');
    expect(headline(steps, false, true)).toBe('Next for mentorship: recruit mentors.');
    expect(headline(steps, true, true)).toBe('The mentor application is shared. Recruiting is open.');
    expect(headline(MS_VIEW_STRESS.steps, false, true)).toBe('Recruit mentors has no owner yet.');
    expect(headline(withTicks(steps, { m3: true, m4: true, m5: true }), false, true)).toBe('Every mentorship step is done.');
  });
});

describe('stepWord', () => {
  const s = MS_VIEW.steps[3];
  it('Done, Now, Not started, a due word with its title', () => {
    expect(stepWord(MS_VIEW.steps[0], false, TODAY)).toEqual({ text: 'Done', muted: true });
    expect(stepWord(s, true, TODAY)).toEqual({ text: 'Now', muted: true });
    expect(stepWord(s, false, TODAY)).toEqual({ text: 'Not started', muted: true });
    expect(stepWord({ ...s, due: '2026-12-31' }, false, TODAY)).toEqual({ text: 'Thu Dec 31', muted: false, title: 'Due Thursday, December 31' });
  });
});

describe('local ticks', () => {
  it('lays ticks over the server and changes the signature', () => {
    const t = withTicks(MS_VIEW.steps, { m3: true, m1: true });
    expect(t[2].done).toBe(true);
    expect(t[0]).toBe(MS_VIEW.steps[0]);
    expect(stepsSig(t)).not.toBe(stepsSig(MS_VIEW.steps));
  });
  it('writes done, or the step own open status', () => {
    const s = { ...MS_VIEW.steps[2], reopenAs: 'in_progress' as const };
    expect(statusFor(s, true)).toBe('done');
    expect(statusFor(s, false)).toBe('in_progress');
  });
  it('mock clock', () => {
    expect(mockClock(0)).toBe('9:14 AM');
    expect(mockClock(46)).toBe('10:00 AM');
    expect(mockClock(166)).toBe('12:00 PM');
  });
});

describe('pageRows', () => {
  it('reads until an empty page, starting after the rows read', async () => {
    const all = Array.from({ length: 5 }, (_, i) => i);
    const asked: [number, number][] = [];
    const got = await pageRows(async (f, t) => {
      asked.push([f, t]);
      return all.slice(f, Math.min(t + 1, f + 2));
    }, 3);
    expect(got).toEqual(all);
    expect(asked[1]).toEqual([2, 4]);
  });
  it('throws at the ceiling', async () => {
    await expect(pageRows(async () => [1], 1, 3)).rejects.toThrow(/3 pages/);
  });
});

describe('chain', () => {
  it('runs writes on one key in order, even after a failure', async () => {
    const q = new Map<string, Promise<unknown>>();
    const order: string[] = [];
    const slow = chain(q, 'k', () => new Promise((r) => setTimeout(() => { order.push('a'); r('a'); }, 20)));
    const bad = chain(q, 'k', async () => { order.push('b'); throw new Error('x'); });
    const last = chain(q, 'k', async () => { order.push('c'); return 'c'; });
    await expect(slow).resolves.toBe('a');
    await expect(bad).rejects.toThrow('x');
    await expect(last).resolves.toBe('c');
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('open status, Undo status and rollback', () => {
  it('keeps a loaded step\'s exact open status (declined, in_progress), else open', () => {
    expect(openStatus('declined')).toBe('declined');
    expect(openStatus('in_progress')).toBe('in_progress');
    expect(openStatus('done')).toBe('open');
    expect(openStatus(undefined)).toBe('open');
    const [d] = mapSteps([{ id: 'a', title: 'A', status: 'declined', position: 1 }], []);
    expect(d).toMatchObject({ done: false, reopenAs: 'declined' });
    expect(statusFor(d, false)).toBe('declined');
  });
  it('Undo puts back the pre-tick status: in_progress and declined exactly, done for a step shown done', () => {
    const base = MS_VIEW.steps[2];
    expect(shownStatus({ ...base, reopenAs: 'in_progress' })).toBe('in_progress');
    expect(shownStatus({ ...base, reopenAs: 'declined' })).toBe('declined');
    expect(shownStatus({ ...base, done: true, reopenAs: 'declined' })).toBe('done');
  });

  // The board's flow for one step, without React: each action lays its tick and gets the next sequence number; each
  // write's answer goes through settleTick, and only the newest may act.
  function flow(serverDone: boolean) {
    const server = [{ ...MS_VIEW.steps[2], done: serverDone }];
    let over: Record<string, boolean> = {};
    let seq = 0;
    const act = (done: boolean) => {
      over = { ...over, m3: done };
      return ++seq;
    };
    const settle = (mine: number, res: 'ok' | 'changed' | 'failed') => {
      over = settleTick(over, 'm3', res, mine === seq);
    };
    const shown = () => withTicks(server, over)[0].done;
    return { act, settle, shown, over: () => over };
  }

  it('double tap while offline, both writes fail: the server value shows (not the first tap)', () => {
    const f = flow(true);
    const a = f.act(false); // reopen
    const b = f.act(true); // done again
    f.settle(a, 'failed');
    expect(f.shown()).toBe(true);
    f.settle(b, 'failed');
    expect(f.over()).toEqual({});
    expect(f.shown()).toBe(true);
  });
  it('tick then Undo, both fail: the server value shows', () => {
    const f = flow(false);
    const tick = f.act(true);
    const undo = f.act(false);
    f.settle(tick, 'failed');
    f.settle(undo, 'failed');
    expect(f.over()).toEqual({});
    expect(f.shown()).toBe(false);
  });
  it('a missed Undo guard drops the local tick too; a saved newest write keeps it', () => {
    const f = flow(false);
    const tick = f.act(true);
    f.settle(tick, 'ok');
    expect(f.over()).toEqual({ m3: true });
    const undo = f.act(false);
    f.settle(undo, 'changed');
    expect(f.over()).toEqual({});
  });
});

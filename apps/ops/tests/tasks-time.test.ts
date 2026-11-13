import { describe, expect, it } from 'vitest';
import { byDue, cnt, commentWhen, detailActions, emptyLine, inTab, kindOf, matches, money, nextUp, parseAdd, relWords, startTab, taskRowActions, type TasksFilter } from '@/lib/tasks-time';
import { LIVE_CAPS } from '@/lib/tasks-map';
import { TASKS_VIEW } from '@/mock/tasks-view';
import type { TasksTask } from '@/lib/tasks-view';

const TODAY = '2026-11-10';
const mockCaps = TASKS_VIEW.caps;
const task = (id: string) => TASKS_VIEW.tasks.find((t) => t.id === id) as TasksTask;
const f = (o: Partial<TasksFilter> = {}): TasksFilter => ({ tab: 'mine', who: '', area: '', q: '', ...o });

describe('B16: a late approval never offers Mark done', () => {
  const late: TasksTask = { ...task('budget'), dueOn: '2026-11-02' };
  it('live mode: no check, no snooze, no swipe Review on the row; Review link in the detail, never Mark done', () => {
    expect(taskRowActions(late, LIVE_CAPS)).toEqual({ check: false, snooze: false, review: false });
    const d = detailActions(late, LIVE_CAPS);
    expect(d.markDone).toBe(false);
    expect(d.approve).toBe(false);
    expect(d.decline).toBe(false);
    expect(d.reason).toBe(false);
    expect(d.review).toBe(true);
    expect(d.tick).toBe(false);
  });
  it('mock mode: approved in place, still never a check or Mark done', () => {
    expect(taskRowActions(late, mockCaps)).toEqual({ check: false, snooze: true, review: true });
    const d = detailActions(late, mockCaps);
    expect(d.markDone).toBe(false);
    expect(d.approve).toBe(true);
    expect(d.review).toBe(false);
  });
  it('an approval with no plan sends people to the approval page even in mock mode', () => {
    expect(detailActions({ ...late, approval: null }, mockCaps)).toMatchObject({ approve: false, review: true, markDone: false });
  });
});

describe('row and detail actions', () => {
  it('a plain task gets the check and snooze its caps allow', () => {
    expect(taskRowActions(task('grants'), LIVE_CAPS)).toEqual({ check: true, snooze: true, review: false });
    expect(taskRowActions(task('grants'), { ...LIVE_CAPS, done: false, snooze: false })).toEqual({ check: false, snooze: false, review: false });
  });
  it('the availability request (not stored) offers nothing but its link', () => {
    const req = { ...task('grants'), kind: 'request' as const, stored: false };
    expect(taskRowActions(req, mockCaps)).toEqual({ check: false, snooze: false, review: false });
    expect(detailActions(req, mockCaps)).toMatchObject({ markDone: false, snooze: false, comment: false, tick: false });
  });
  it('checklist steps tick only when caps allow and the steps are read', () => {
    expect(detailActions(task('prep'), mockCaps).tick).toBe(true);
    expect(detailActions(task('prep'), LIVE_CAPS).tick).toBe(false);
    expect(detailActions(task('budget'), mockCaps).tick).toBe(false);
  });
  it('a decline reason needs its cap', () => {
    expect(detailActions(task('budget'), mockCaps).reason).toBe(true);
    expect(detailActions(task('budget'), { ...mockCaps, declineReason: false }).reason).toBe(false);
  });
});

describe('tabs and filters', () => {
  it('reads the starting tab', () => {
    expect(startTab(undefined)).toBe('mine');
    expect(startTab('team')).toBe('team');
    expect(startTab('approvals')).toBe('appr');
    expect(startTab('appr')).toBe('appr');
    expect(startTab('nonsense')).toBe('mine');
  });
  it('puts tasks on their tabs', () => {
    expect(inTab(task('grants'), 'mine')).toBe(false);
    expect(inTab(task('grants'), 'team')).toBe(true);
    expect(inTab(task('budget'), 'appr')).toBe(true);
    expect(inTab(task('share'), 'appr')).toBe(false);
  });
  it('filters by person (Team only), area and words', () => {
    expect(matches(task('grants'), f({ tab: 'team', who: 'kd' }))).toBe(true);
    expect(matches(task('grants'), f({ tab: 'team', who: 'ck' }))).toBe(false);
    // The person filter matches any owner, not only the first.
    expect(matches({ ...task('grants'), ownerIds: ['kd', 'ck'] }, f({ tab: 'team', who: 'ck' }))).toBe(true);
    expect(matches(task('share'), f({ area: 'Finance' }))).toBe(false);
    expect(matches(task('share'), f({ area: 'Finance' }), { noArea: true })).toBe(true);
    expect(matches(task('share'), f({ q: '  SCHEDULE ' }))).toBe(true);
    expect(matches(task('share'), f({ q: 'budget' }))).toBe(false);
  });
  it('says what the empty list means', () => {
    expect(emptyLine(f({ area: 'Programs', q: 'x' }), null)).toEqual({ text: 'Nothing open in Programs matching “x”.', clear: true });
    expect(emptyLine(f({ tab: 'team', who: 'kd' }), 'Keith Dawson')).toEqual({ text: 'Nothing open for Keith Dawson.', clear: true });
    expect(emptyLine(f({ tab: 'appr' }), null)).toEqual({ text: 'Nothing waits for your approval.', clear: false });
    expect(emptyLine(f(), null)).toEqual({ text: "You're clear. Nothing open.", clear: false });
  });
});

describe('words and numbers', () => {
  it('caps counts at 99+', () => {
    expect(cnt(99)).toBe('99');
    expect(cnt(120)).toBe('99+');
  });
  it('formats money', () => {
    expect(money(483000)).toBe('$4,830');
    expect(money(483050)).toBe('$4,830.50');
  });
  it('names relative days', () => {
    expect(relWords(TODAY, '2026-11-10')).toBe('today');
    expect(relWords(TODAY, '2026-11-11')).toBe('tomorrow');
    expect(relWords(TODAY, '2026-11-12')).toBe('Thursday');
    expect(relWords(TODAY, '2026-11-16')).toBe('next Monday');
  });
  it('dates comments', () => {
    expect(commentWhen(TODAY, '2026-11-09T21:40:00Z')).toBe('Mon 4:40 PM');
    expect(commentWhen(TODAY, '2026-10-20T15:00:00Z')).toBe('Oct 20');
  });
  it('picks the kind word and tint', () => {
    expect(kindOf('approval', false, false)).toEqual({ icon: 'approve', word: 'Approval', cls: ' rf-k-gold' });
    expect(kindOf('task', true, false).cls).toBe(' rf-k-tint');
    expect(kindOf('post', false, false)).toEqual({ icon: 'mega', word: 'Post', cls: '' });
  });
  it('sorts by due date, undated last, then data order', () => {
    const items = [{ dueOn: null, n: 0 }, { dueOn: '2026-11-12', n: 1 }, { dueOn: '2026-11-11', n: 2 }, { dueOn: '2026-11-12', n: 3 }];
    expect(byDue(items, (t) => t.n).map((t) => t.n)).toEqual([2, 1, 3, 0]);
  });
});

describe('nextUp', () => {
  it('puts the viewer’s approval first', () => {
    expect(nextUp(TODAY, TASKS_VIEW.tasks)).toMatchObject({ id: 'budget', kicker: 'Needs your approval', go: 'Review', gold: true });
  });
  it('then a late task, then the next due', () => {
    const open = TASKS_VIEW.tasks.filter((t) => t.kind !== 'approval');
    expect(nextUp(TODAY, open)).toMatchObject({ id: 'share', kicker: '1 day late', icon: 'alert' });
    expect(nextUp(TODAY, open.filter((t) => t.id !== 'share'))).toMatchObject({ id: 'ig', kicker: 'Next · due tomorrow' });
  });
  it('ignores prompts and other people’s tasks; null when clear', () => {
    expect(nextUp(TODAY, [{ ...task('grants') }, { ...task('share'), stored: false }])).toBeNull();
  });
});

describe('parseAdd', () => {
  it('takes the area filter when no area word is typed', () => {
    expect(parseAdd(TODAY, 'Call the venue', { date: false, area: false }, 'Programs').area).toBe('Programs');
    expect(parseAdd(TODAY, 'Call the venue', { date: false, area: true }, 'Programs').area).toBeNull();
    expect(parseAdd(TODAY, '', { date: false, area: false }, 'Programs').area).toBeNull();
  });
});

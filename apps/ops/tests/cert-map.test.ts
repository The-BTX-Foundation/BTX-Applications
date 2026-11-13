// The Certifications page's pure logic (lib/cert-map.ts): the news card, the due line, progress, and the live mappers.
import { describe, expect, it } from 'vitest';
import { certNews, dueLine, liveCaps, liveIdeas, livePlan, liveSteps, nextPosition, progress } from '@/lib/cert-map';
import type { CertStep } from '@/lib/cert-view';

const T = '2026-11-10';
// A step with defaults.
const step = (o: Partial<CertStep>): CertStep => ({
  id: 's', title: 'Step', owner: null, unassigned: false, due: null, dueText: null, noDue: false, sub: null, call: null, ideas: false, status: 'open', approval: false, position: 1, ...o,
});
const staff = [
  { id: 'u1', name: 'Camila Keane', initials: 'CK' },
  { id: 'u2', name: 'Toby Faraday', initials: 'TF' },
];

describe('progress and news', () => {
  it('counts done steps and points at the first not done', () => {
    const s = [step({ id: 'a', status: 'done' }), step({ id: 'b' }), step({ id: 'c' })];
    expect(progress(s)).toEqual({ done: 1, total: 3, nowId: 'b' });
    expect(progress([step({ id: 'a', status: 'done' })]).nowId).toBeNull();
  });
  it('says a late step with its owner first name', () => {
    const n = certNews(T, [step({ id: 'a', due: '2026-10-28', owner: { id: 'u1', name: 'Camila Keane', initials: 'CK', mine: false } })]);
    expect(n).toMatchObject({ kicker: '13 days late · Camila', icon: 'alert', gold: false, stepId: 'a' });
  });
  it('is gold for my step, notes "No owner", and is null when all is done', () => {
    expect(certNews(T, [step({ owner: { id: 'dm', name: 'Dana', initials: 'DM', mine: true }, dueText: 'From January' })])).toMatchObject({ kicker: 'From January', gold: true, icon: 'wait' });
    expect(certNews(T, [step({ unassigned: true })])?.kicker).toBe('Next step · No owner');
    expect(certNews(T, [step({ status: 'done' })])).toBeNull();
  });
});

describe('dueLine', () => {
  it('covers done, late, words, no date and none', () => {
    expect(dueLine(T, { status: 'done', due: '2026-11-01', dueText: null, noDue: false })).toMatchObject({ text: 'Done', muted: true });
    expect(dueLine(T, { status: 'open', due: '2026-11-01', dueText: null, noDue: false })).toMatchObject({ late: true, muted: false });
    expect(dueLine(T, { status: 'open', due: null, dueText: 'From January', noDue: false })).toEqual({ text: 'From January', late: false, muted: false });
    expect(dueLine(T, { status: 'open', due: null, dueText: null, noDue: true })).toBeNull();
    expect(dueLine(T, { status: 'open', due: null, dueText: null, noDue: false })).toEqual({ text: 'No date', late: false, muted: true });
  });
});

describe('live mappers', () => {
  it('builds the plan line and caps the seats', () => {
    const p = livePlan({ pilot_budget_cents: 150000, budget_period: 'Q4 2026', students_target: 5, cost_per_student_cents: 30000 });
    expect(p).toMatchObject({ budget: '$1,500', note: 'Q4 2026', seats: 5, seatsLabel: '5 seats' });
    expect(p.line).toBe('BTX pays exam fees: about $300 each for up to 5 students');
    expect(livePlan({ students_target: 40 }).seats).toBe(12);
    expect(livePlan({}).budget).toBe('Not set');
    expect(livePlan({}).seatsLabel).toBe('No seats yet');
  });
  it('maps tasks: drops declined, sorts by position, one ideas step, approval flag, owners', () => {
    const tasks = [
      { id: 't3', title: 'Approve the budget', status: 'open', type: 'approval', position: 3 },
      { id: 't1', title: 'Pick the first certifications', status: 'open', position: 1, due_on: '2026-10-28' },
      { id: 't2', title: 'More certification ideas', status: 'done', position: 2, note: 'x' },
      { id: 't4', title: 'Gone', status: 'declined', position: 0 },
      { id: 't5', title: 'Group job', status: 'open', position: 5, assignee_group: 'board' },
    ];
    const s = liveSteps(tasks, [{ task_id: 't1', user_id: 'ghost' }, { task_id: 't1', user_id: 'u1' }], staff, 'u1');
    expect(s.map((x) => x.id)).toEqual(['t1', 't2', 't3', 't5']);
    expect(s[0]).toMatchObject({ ideas: true, owner: { id: 'u1', mine: true }, due: '2026-10-28', unassigned: false });
    expect(s[1]).toMatchObject({ ideas: false, status: 'done', sub: 'x', unassigned: false });
    expect(s[2]).toMatchObject({ approval: true, unassigned: true });
    expect(s[3].unassigned).toBe(false);
  });
  it('maps ideas oldest first with You and decisions', () => {
    const i = liveIdeas(
      [
        { id: 'b', name: 'PMP', decision: 'chosen', suggested_by: 'u1', created_at: '2026-11-02' },
        { id: 'a', name: 'FE', decision: 'not_decided', suggested_by: 'u2', created_at: '2026-11-01' },
        { id: 'c', name: 'X', decision: 'dropped', suggested_by: 'zz', created_at: '2026-11-03' },
      ],
      staff,
      'u1',
    );
    expect(i.map((x) => [x.id, x.by, x.decision])).toEqual([
      ['a', 'Toby Faraday', 'open'],
      ['b', 'You', 'chosen'],
      ['c', 'A board member', 'dropped'],
    ]);
  });
  it('hides mock-only controls in live mode', () => {
    expect(liveCaps({ programId: 'p', chat: true })).toEqual({ tick: true, addTask: true, parse: false, addIdea: true, decide: false, undo: false, nKey: false, chat: true });
    expect(liveCaps({ programId: null, chat: false })).toMatchObject({ addTask: false, addIdea: false, chat: false });
  });
  it('puts a new step after the last', () => {
    expect(nextPosition([{ position: 2 }, { position: 7 }])).toBe(8);
    expect(nextPosition([])).toBe(1);
  });
});

import { applyOverrides, dropOverride, ideasPlace, setOverride, settleFailed } from '@/lib/cert-map';

describe('ideasPlace (ideas reachable in every state)', () => {
  const s = (id: string, ideas: boolean, status: CertStep['status'] = 'open') => ({ id, ideas, status });
  it('no steps, or no step about certifications: their own panel with the add form', () => {
    expect(ideasPlace([], null, 3)).toEqual({ at: 'panel', stepId: null, withAdd: true });
    expect(ideasPlace([s('a', false)], 'a', 2)).toEqual({ at: 'panel', stepId: null, withAdd: true });
  });
  it('inside the step that is now (the demo)', () => {
    expect(ideasPlace([s('a', true)], 'a', 0)).toEqual({ at: 'step', stepId: 'a', withAdd: true });
  });
  it('folded under a later step without the add; under a done step with the add', () => {
    expect(ideasPlace([s('a', false), s('b', true)], 'a', 2)).toEqual({ at: 'fold', stepId: 'b', withAdd: false });
    expect(ideasPlace([s('b', true, 'done'), s('c', false)], 'c', 2)).toEqual({ at: 'fold', stepId: 'b', withAdd: true });
  });
  it('a done step with no ideas to fold: the panel', () => {
    expect(ideasPlace([s('b', true, 'done'), s('c', false)], 'c', 0)).toEqual({ at: 'panel', stepId: null, withAdd: true });
  });
});

describe('status overrides (a refused tick shows the server status)', () => {
  it('tick then untick, both refused while offline, ends on the server status', () => {
    const rows = [{ id: 'a', status: 'open' as const }];
    let ov = setOverride({}, 'a', 'done'); // tick
    ov = setOverride(ov, 'a', 'open'); // untick before the first answer
    ov = dropOverride(ov, 'a'); // the tick is refused
    ov = dropOverride(ov, 'a'); // the untick is refused
    expect(applyOverrides(rows, ov)[0].status).toBe('open');
    // A server that had it done shows done after the same two refusals.
    expect(applyOverrides([{ id: 'a', status: 'done' as const }], ov)[0].status).toBe('done');
  });
});

describe('settleFailed (an add that saved after a lost answer)', () => {
  it('clears the error and the box holding those words, so Try again cannot duplicate', () => {
    const r = settleFailed(
      [
        { id: 't1', kind: 'task', words: 'Draft the form' },
        { id: 'i1', kind: 'idea', words: 'PMP' },
      ],
      new Set(['t1', 'i1']),
      { task: 'Draft the form', idea: 'PMP' },
    );
    expect(r).toEqual({ left: [], clearErr: true, task: '', idea: '' });
  });
  it('keeps other words, and adds not listed stay failed', () => {
    const r = settleFailed([{ id: 't1', kind: 'task', words: 'Draft' }, { id: 't2', kind: 'task', words: 'Book' }], new Set(['t1']), { task: 'Something new', idea: '' });
    expect(r.left.map((f) => f.id)).toEqual(['t2']);
    expect(r.clearErr).toBe(true);
    expect(r.task).toBe('Something new');
    expect(settleFailed([{ id: 't2', kind: 'task', words: 'Book' }], new Set(), { task: 'Book', idea: '' })).toMatchObject({ clearErr: false, task: 'Book' });
  });
});

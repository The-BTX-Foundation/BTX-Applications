// The Cycle page's pure logic (lib/cycle-map.ts): B14 open / closed from the dates (checked against the Portal's own
// cycleVariant), the six schedule stages, the dated line, the words on a step, the news card, progress, and live tasks
// mapped to steps.
import { describe, expect, it } from 'vitest';
import { cycleVariant } from '../../../packages/data/src/cycles';
import { axisFor, chunk, classify, closeDay, cyclePhase, fixedSteps, instantMs, linkFor, mapRows, newsFor, nowStage, openDay, progress, rowWhen, stageRel, stagesFor, subParts, waitingOn } from '@/lib/cycle-map';
import { easternDay } from '@/lib/refresh-time';
import type { CyCycle, CyRow } from '@/lib/cycle-view';
import { CY_NOW, CY_TODAY, CY_VIEW } from '@/mock/cycle-view';

const OPENS = '2026-10-12T04:00:00.000Z';
const CLOSES = '2026-11-07T04:59:00.000Z';

// The sample cycle with some fields replaced.
const cyc = (o: Partial<CyCycle> = {}): CyCycle => ({ ...(CY_VIEW.cycle as CyCycle), ...o });

// A step with defaults.
const step = (o: Partial<CyRow>): CyRow => ({ id: 'x', group: 'interviews', title: 'Step', owner: null, done: false, doneAt: null, due: null, time: null, act: null, link: null, ...o });

describe('cyclePhase (B14)', () => {
  const cases: [string, string | null, string | null][] = [
    ['2026-10-01T12:00:00.000Z', OPENS, CLOSES],
    [OPENS, OPENS, CLOSES],
    ['2026-10-20T12:00:00.000Z', OPENS, CLOSES],
    ['2026-11-07T04:58:59.000Z', OPENS, CLOSES],
    [CLOSES, OPENS, CLOSES],
    ['2026-12-01T12:00:00.000Z', OPENS, CLOSES],
    ['2026-10-20T12:00:00.000Z', OPENS, null],
    ['2026-10-20T12:00:00.000Z', null, CLOSES],
  ];
  it.each(cases)('at %s matches the Portal', (now, opens, closes) => {
    expect(cyclePhase(now, opens, closes)).toBe(cycleVariant({ opens_at: opens, closes_at: closes }, new Date(now)));
  });

  it('reads the dates, not a status: open before the deadline hour, closed at it', () => {
    expect(cyclePhase('2026-11-07T04:58:00.000Z', OPENS, CLOSES)).toBe('open');
    expect(cyclePhase('2026-11-07T04:59:00.000Z', OPENS, CLOSES)).toBe('closed');
    expect(cyclePhase('2026-10-11T12:00:00.000Z', OPENS, CLOSES)).toBe('before-open');
  });
});

describe('words', () => {
  it('stageRel counts calendar days', () => {
    expect(stageRel('2026-11-10', '2026-11-10')).toBe('Today');
    expect(stageRel('2026-11-10', '2026-11-11')).toBe('Tomorrow');
    expect(stageRel('2026-11-10', '2026-11-09')).toBe('Yesterday');
    expect(stageRel('2026-11-10', '2026-11-22')).toBe('in 12 days');
  });

  it('rowWhen: done, late, due with time, none', () => {
    expect(rowWhen('2026-11-10', step({ done: true }), 'today, 9:15 AM')).toEqual({ kind: 'done', text: 'Done today, 9:15 AM' });
    expect(rowWhen('2026-11-10', step({ due: '2026-11-09' }))).toMatchObject({ kind: 'late', text: '1 day late' });
    expect(rowWhen('2026-11-10', step({ due: '2026-11-24', time: '7:00 PM' }))).toMatchObject({ kind: 'due', text: 'Tue Nov 24, 7:00 PM' });
    expect(rowWhen('2026-11-10', step({}))).toEqual({ kind: 'none' });
  });

  it('waitingOn names only another person whose step is late', () => {
    const p = { kind: 'person' as const, label: 'Charlie Brooks', initials: 'CB' };
    expect(waitingOn('2026-11-10', step({ owner: p, due: '2026-11-08' }))).toBe('Charlie');
    expect(waitingOn('2026-11-10', step({ owner: p, due: '2026-11-12' }))).toBeNull();
    expect(waitingOn('2026-11-10', step({ owner: { kind: 'me', label: 'Dana', initials: 'D' }, due: '2026-11-08' }))).toBeNull();
  });

  it('subParts drops a missing amount', () => {
    expect(subParts(cyc())).toEqual(['Legacy Scholarship', '$2,500']);
    expect(subParts(cyc({ amountCents: null }))).toEqual(['Legacy Scholarship']);
  });
});

describe('stagesFor and axisFor', () => {
  it('the sample day: applications closed, interviews now (day 1 of 11), the rest ahead, funds unset', () => {
    const st = stagesFor(cyc(), CY_TODAY, CY_NOW);
    expect(st.map((x) => x.state)).toEqual(['done', 'now', 'up', 'up', 'up', 'unset']);
    expect(st[1].note).toMatchObject({ text: 'Now · day 1 of 11' });
    expect(nowStage(st)?.group).toBe('interviews');
  });

  it('while applications are open, applications is now', () => {
    const st = stagesFor(cyc(), '2026-10-20', '2026-10-20T14:00:00.000Z');
    expect(st[0].state).toBe('now');
    expect(st[1].state).toBe('up');
  });

  it('before applications open, nothing is done', () => {
    const st = stagesFor(cyc(), '2026-10-01', '2026-10-01T14:00:00.000Z');
    expect(st.some((x) => x.state === 'done')).toBe(false);
    expect(st[0].note).toMatchObject({ text: expect.stringMatching(/^Opens /) });
  });

  it('live shape: interviews just ended, later dates all null: the next stage is Now and keeps "Date not set"', () => {
    const c = cyc({ scoresDue: null, selectionDay: null, selectionTime: null, decisionDate: '2026-11-30', fundsSent: null, scored: 4 });
    for (const today of ['2026-11-21', '2026-11-28']) {
      const st = stagesFor(c, today, `${today}T15:00:00.000Z`);
      expect(st.map((x) => x.state)).toEqual(['done', 'done', 'now', 'unset', 'up', 'unset']);
      expect(st[2].note).toEqual({ kind: 'unset' });
      expect(st[2].drawn).toMatchObject({ kind: 'bar', what: 'scored', k: 4 });
      expect(nowStage(st)?.group).toBe('scoring');
    }
    // Everything null after interviews.
    const bare = stagesFor(cyc({ scoresDue: null, selectionDay: null, decisionDate: null, fundsSent: null }), '2026-11-21', '2026-11-21T15:00:00.000Z');
    expect(nowStage(bare)?.key).toBe('scores');
  });

  it('cyclePhase wins for Applications: still open while a later stage is done', () => {
    // Interviews (Nov 10 to 20) before a Dec 1 deadline: on Nov 25 interviews are done but applications are open.
    const st = stagesFor(cyc({ closesAt: '2026-12-01T04:59:00.000Z' }), '2026-11-25', '2026-11-25T15:00:00.000Z');
    expect(st[0].state).toBe('now');
    expect(st[0].note).not.toEqual({ kind: 'closed' });
    expect(st[1].state).toBe('done');
  });

  it('axisFor puts today inside the range and returns null without an opening day', () => {
    const c = cyc();
    const ax = axisFor(c, stagesFor(c, CY_TODAY, CY_NOW), CY_TODAY);
    expect(ax?.today).toBeGreaterThan(0);
    expect(ax?.labels.some((l) => l.text === 'Today')).toBe(true);
    expect(axisFor(cyc({ opensAt: null }), [], CY_TODAY)).toBeNull();
  });
});

describe('news card and progress', () => {
  it('mock: remind first, then the late share step, then nothing', () => {
    const rows = [step({ id: 'share', act: 'share', due: '2026-11-09', title: 'Share' }), step({ id: 'remind', act: 'remind', title: 'Remind' })];
    expect(newsFor(rows, CY_TODAY, { unbooked: 16 })?.kicker).toBe('16 students not booked');
    expect(newsFor([rows[0]], CY_TODAY, { unbooked: 16 })?.kicker).toBe('1 day late');
    expect(newsFor([], CY_TODAY, { unbooked: 16 })).toBeNull();
  });

  it('live: my earliest open step, never a demo action', () => {
    const me = { kind: 'me' as const, label: 'Dana', initials: 'DM' };
    const n = newsFor([step({ id: 'a', owner: me, due: '2026-11-15' }), step({ id: 'b', owner: me, due: '2026-11-08' }), step({ id: 'c', due: '2026-11-01' })], CY_TODAY, null);
    expect(n).toMatchObject({ id: 'b', kicker: '2 days late', go: 'See it' });
  });

  it("progress counts the fixed steps plus the rows (mock draws the demo's three award steps)", () => {
    const rows = [step({ done: true }), step({})];
    // Applications: publish, open, close all done; award: none done.
    expect(progress(cyc(), rows, CY_NOW, true)).toEqual({ done: 4, total: 8 });
    expect(progress(cyc(), rows, CY_NOW)).toEqual({ done: 4, total: 6 });
  });

  it('live: no invented award steps, a fully done cycle reaches 100%, a real "Send funds" task counts once', () => {
    const c = cyc({ released: true });
    expect(fixedSteps('award', c, CY_NOW).map((x) => x.label)).toEqual(['Announce the award, Mon Nov 30']);
    expect(fixedSteps('award', c, CY_NOW, true)).toHaveLength(3);
    const rows = [step({ id: 'f', group: 'award', title: 'Send funds', done: true })];
    const p = progress(c, rows, '2026-12-05T15:00:00.000Z');
    expect(p).toEqual({ done: 5, total: 5 });
    expect(fixedSteps('award', c, CY_NOW).some((x) => /fund/i.test(x.label))).toBe(false);
  });
});

describe('live tasks to steps', () => {
  it('classify: title words, then list title, then type, then due day, then the stage that is now', () => {
    const c = cyc();
    expect(classify({ title: 'Book the scoring rubric' }, '', c, null)).toBe('scoring');
    expect(classify({ title: 'Misc' }, 'Award follow-up', c, null)).toBe('award');
    expect(classify({ title: 'Misc', type: 'meeting' }, '', c, null)).toBe('selection');
    expect(classify({ title: 'Misc', due_on: '2026-11-01' }, '', c, null)).toBe('applications');
    expect(classify({ title: 'Misc' }, '', c, 'scoring')).toBe('scoring');
  });

  it('linkFor: Review goes to the bare approval page (no plan id in a cycle task)', () => {
    expect(linkFor('approval', 'interviews')).toEqual({ label: 'Review', href: '/finance/budget/approval' });
    expect(linkFor('task', 'interviews').href).toBe('/scholarships/interviews');
    expect(linkFor('task', 'award').href).toBe('/tasks');
  });

  it('mapRows orders by list, position and id, and names owners', () => {
    const staff = new Map([['u2', { name: 'Charlie Brooks', initials: 'CB' }]]);
    const me = { userId: 'u1', name: 'Dana Mercer', initials: 'DM' };
    const rows = mapRows(
      [{ id: 'L1', title: 'Interviews' }, { id: 'L2', title: 'Award' }],
      [
        { id: 't3', title: 'Send funds', checklist_id: 'L2', position: 1, status: 'open' },
        { id: 't2', title: 'Interview pairs', checklist_id: 'L1', position: 2, status: 'done', completed_at: '2026-11-09T15:00:00Z' },
        { id: 't1', title: 'Book rooms', checklist_id: 'L1', position: 1, status: 'open', due_on: '2026-11-12' },
        { id: 't9', title: 'Elsewhere', checklist_id: 'other', position: 1, status: 'open' },
      ],
      [{ task_id: 't1', user_id: 'u1' }, { task_id: 't3', user_id: 'u2' }],
      staff,
      me,
      cyc(),
      'interviews',
    );
    expect(rows.map((r) => r.id)).toEqual(['t1', 't2', 't3']);
    expect(rows[0].owner?.kind).toBe('me');
    expect(rows[2].owner).toMatchObject({ kind: 'person', label: 'Charlie Brooks' });
    expect(rows[1]).toMatchObject({ done: true, link: null });
    expect(rows.every((r) => r.act === null)).toBe(true);
  });

  it('mapRows leaves declined tasks out (they neither count nor show)', () => {
    const rows = mapRows(
      [{ id: 'L1', title: 'Interviews' }],
      [
        { id: 't1', title: 'Book rooms', checklist_id: 'L1', position: 1, status: 'open' },
        { id: 't2', title: 'Order catering', checklist_id: 'L1', position: 2, status: 'declined' },
      ],
      [],
      new Map(),
      { userId: 'u1', name: 'Dana Mercer', initials: 'DM' },
      cyc(),
      'interviews',
    );
    expect(rows.map((r) => r.id)).toEqual(['t1']);
    expect(progress(cyc(), rows, CY_NOW).total).toBe(5);
  });

  it('chunk splits ids into groups of 100', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe('days and instants', () => {
  it('openDay and closeDay at the daylight-saving changes and at midnight Eastern', () => {
    // Nov 1 2026: clocks fall back at 2:00 AM EDT (06:00 UTC).
    expect(easternDay('2026-11-01T05:30:00.000Z')).toBe('2026-11-01');
    expect(easternDay('2026-11-01T06:30:00.000Z')).toBe('2026-11-01');
    expect(easternDay('2026-11-01T03:59:00.000Z')).toBe('2026-10-31');
    // Mar 8 2026: clocks spring forward at 2:00 AM EST (07:00 UTC).
    expect(easternDay('2026-03-08T04:59:00.000Z')).toBe('2026-03-07');
    expect(easternDay('2026-03-08T07:30:00.000Z')).toBe('2026-03-08');
    // Closing at midnight Eastern (EST) is the start of that day; one minute earlier is the day before.
    expect(closeDay(cyc({ closesAt: '2026-11-07T05:00:00.000Z' }))).toBe('2026-11-07');
    expect(closeDay(cyc({ closesAt: '2026-11-07T04:59:00.000Z' }))).toBe('2026-11-06');
    // Opening at midnight EDT on the change day.
    expect(openDay(cyc({ opensAt: '2026-11-01T04:00:00.000Z' }))).toBe('2026-11-01');
  });

  it('instantMs cuts microseconds (Postgres) to milliseconds, so every browser reads them', () => {
    expect(instantMs('2026-11-07T04:59:59.123456+00:00')).toBe(Date.parse('2026-11-07T04:59:59.123Z'));
    expect(instantMs('2026-11-07T04:59:59+00:00')).toBe(Date.parse('2026-11-07T04:59:59Z'));
    expect(cyclePhase('2026-11-07T04:59:59.123999+00:00', OPENS, '2026-11-07T04:59:59.124000+00:00')).toBe('open');
    expect(cyclePhase('2026-11-07T04:59:59.124+00:00', OPENS, '2026-11-07T04:59:59.124000+00:00')).toBe('closed');
  });

  it('agrees with the Portal for ordinary Postgres timestamps', () => {
    const closes = '2026-11-07T04:59:00+00:00';
    for (const now of ['2026-11-07T04:58:00.000Z', '2026-11-07T04:59:00.000Z']) {
      expect(cyclePhase(now, '2026-10-12T04:00:00+00:00', closes)).toBe(cycleVariant({ opens_at: '2026-10-12T04:00:00+00:00', closes_at: closes }, new Date(now)));
    }
  });
});

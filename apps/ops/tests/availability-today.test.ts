import { describe, expect, it } from 'vitest';
import { availabilityRow, insertRow, withAvailabilityRequest, AVAILABILITY_HREF } from '@/lib/availability-today';
import { buildToday } from '@/lib/daily-tasks';
import type { TasksData } from '@/lib/tasks-shared';

const cycle = { id: 'c1', closesAt: '2026-11-07T04:59:00Z', interviewStart: '2026-11-10', interviewEnd: '2026-11-20' };

describe('availabilityRow', () => {
  it('asks for availability by the Eastern close date and links to the page', () => {
    const r = availabilityRow({ cycle, sentAt: null, today: '2026-11-02' })!;
    expect(r.due).toBe('2026-11-06');
    expect(r.row.title).toBe('Give your interview availability by Fri Nov 6');
    expect(r.row.href).toBe(AVAILABILITY_HREF);
    expect(r.row.due).toBe('Fri Nov 6');
    expect(r.row.phoneLate).toBeUndefined();
    // The phone always gets an "Add times" button that is not a dead pill: secondary when not late.
    expect(r.row.phoneActions).toEqual([{ label: 'Add times', kind: 's' }]);
  });
  it('says late once the close date has passed', () => {
    const r = availabilityRow({ cycle, sentAt: null, today: '2026-11-08' })!;
    expect(r.row.rel).toEqual({ text: '2 days late', late: true });
    expect(r.row.phoneLate).toBe(true);
    expect(r.row.phoneActions).toEqual([{ label: 'Add times', kind: 'p' }]);
  });
  it('shows nothing once sent, once interviews are over, or with no interview dates', () => {
    expect(availabilityRow({ cycle, sentAt: '2026-11-01T12:00:00Z', today: '2026-11-02' })).toBeNull();
    expect(availabilityRow({ cycle, sentAt: null, today: '2026-11-21' })).toBeNull();
    expect(availabilityRow({ cycle: { ...cycle, interviewStart: null, interviewEnd: null }, sentAt: null, today: '2026-11-02' })).toBeNull();
    expect(availabilityRow({ cycle: null, sentAt: null, today: '2026-11-02' })).toBeNull();
  });
  it('still shows when interviews are on and the close date is missing', () => {
    const r = availabilityRow({ cycle: { ...cycle, closesAt: null }, sentAt: null, today: '2026-11-12' })!;
    expect(r.row.title).toBe('Give your interview availability');
    // No close date: the phone pill says "No date", never an empty pill.
    expect(r.row.phoneDue).toBe('No date');
  });
});

describe('insertRow', () => {
  const empty = buildToday({ today: '2026-11-02', first: 'Dania', mine: [], team: [], facts: { mineByArea: {}, ring: {}, cycle: null, fundsCents: null, raisedCents: 0, raiseTargetCents: null, programName: null, programStatus: null, planningCall: null, monthName: 'November', postsPlanned: 0, postsDone: 0, nextPost: null } });
  it('makes the group for its due date and keeps groups in order', () => {
    const item = availabilityRow({ cycle, sentAt: null, today: '2026-11-02' })!;
    const g = insertRow([{ label: 'Later', rows: [] }, ...empty.groups], item, '2026-11-02');
    expect(g.map((x) => x.label)).toEqual(['This week', 'Later']);
    expect(g[0].rows[0].id).toBe('availability-c1');
  });
});

describe('withAvailabilityRequest', () => {
  const base: TasksData = { failed: false, mode: 'live', today: '2026-11-02', me: 'u1', people: [], areas: [], tasks: [], comments: {}, counts: { mine: 2, team: 5, approvals: 1, open: 9, done_week: 3 }, done: [] };
  it('adds the request to the data and counts it in Mine only', () => {
    const item = availabilityRow({ cycle, sentAt: null, today: '2026-11-02' })!;
    const out = withAvailabilityRequest({ ...base, counts: { ...base.counts } }, item);
    expect(out.request?.href).toBe(AVAILABILITY_HREF);
    expect(out.counts).toEqual({ mine: 3, team: 5, approvals: 1, open: 9, done_week: 3 });
    expect(out.tasks).toEqual([]);
  });
  it('changes nothing when nothing is due', () => {
    const data: TasksData = { ...base, counts: { ...base.counts } };
    expect(withAvailabilityRequest(data, null)).toBe(data);
    expect(data.counts.mine).toBe(2);
  });
});

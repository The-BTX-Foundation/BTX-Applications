import { describe, expect, it } from 'vitest';
import { cycleItems, dayAgenda, eventItems, interviewItems, milestoneItems, postItems, taskItems } from '@/lib/daily-calendar';
import { minutes } from '@/components/calendar/dates';

describe('eventItems', () => {
  it('shows Eastern time and drops AM / PM on the chip', () => {
    const [e] = eventItems([{ id: 'e1', title: 'Board meeting', area: 'scholarships', starts_at: '2026-10-14T22:00:00Z', all_day: false, owner_id: 'u1', video_url: 'https://x' }]);
    expect(e).toMatchObject({ date: '2026-10-14', start: '6:00 PM', chip: '6:00 Board meeting', people: ['u1'], video: true, source: 'event' });
  });
  it('keeps an all-day event on its Eastern day with just the title', () => {
    const [e] = eventItems([{ id: 'e2', title: 'Chapter visit', area: null, starts_at: '2026-10-15T04:00:00Z', all_day: true }]);
    expect(e).toMatchObject({ date: '2026-10-15', start: null, chip: 'Chapter visit', area: 'scholarships', people: [] });
  });
});

describe('interviewItems', () => {
  it('joins an active booking to its slot, pair and application code', () => {
    const items = interviewItems(
      [{ id: 'b1', application_id: 'a1', slot_id: 's1', status: 'active' }, { id: 'b2', application_id: 'a2', slot_id: 's1', status: 'released' }],
      [{ id: 's1', starts_at: '2026-10-15T14:00:00Z' }],
      [{ slot_id: 's1', interviewer_a: 'u1', interviewer_b: 'u2', video_url: null }],
      [{ id: 'a1', applicant_code: 'APP-2026-00015' }],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Interview APP-2026-00015', chip: '10:00 Interview', people: ['u1', 'u2'], video: false });
  });
});

describe('taskItems', () => {
  const tasks = [
    { id: 't1', title: 'Send links', area: 'scholarships', status: 'open', due_on: '2026-10-09' },
    { id: 't2', title: 'Due soon', area: 'money', status: 'open', due_on: '2026-10-14' },
    { id: 't3', title: 'Done', area: 'money', status: 'done', due_on: '2026-10-14' },
    { id: 't4', title: 'No date', area: 'money', status: 'open', due_on: null },
  ];
  it('makes a late task a bar to today and others a chip on the due day', () => {
    const items = taskItems(tasks, [{ task_id: 't1', user_id: 'u1' }], '2026-10-12');
    expect(items.map((i) => i.id)).toEqual(['tk:t1', 'tk:t2']);
    expect(items[0]).toMatchObject({ span: true, late: true, endDate: '2026-10-12', chip: 'Send links, 3 days late', people: ['u1'] });
    expect(items[1]).toMatchObject({ date: '2026-10-14', chip: 'Due soon', area: 'money' });
  });
});

describe('postItems, cycleItems, milestoneItems', () => {
  it('maps posts with a date to Outreach', () => {
    expect(postItems([{ id: 'p', title: 'Meet the board', post_on: '2026-10-15' }, { id: 'q', title: 'No date', post_on: null }])).toHaveLength(1);
  });
  it('maps cycle dates and skips archived cycles', () => {
    const items = cycleItems([
      { id: 'c', status: 'published', opens_at: '2026-09-01T04:00:00Z', closes_at: '2026-09-27T03:59:00Z', interview_start: '2026-10-05', interview_end: '2026-10-09', decision_date: '2026-10-23' },
      { id: 'old', status: 'archived', opens_at: '2025-09-01T04:00:00Z' },
    ]);
    expect(items.map((i) => i.title)).toEqual(['Applications open', 'Applications close', 'Interviews, to Fri Oct 9', 'Decisions']);
    expect(items[1].date).toBe('2026-09-26');
    expect(items[2]).toMatchObject({ span: true, endDate: '2026-10-09' });
  });
  it('skips done and archived milestones', () => {
    expect(milestoneItems([{ id: 'm1', name: 'A', due_on: '2026-10-20' }, { id: 'm2', name: 'B', due_on: '2026-10-20', done: true }, { id: 'm3', name: 'C', due_on: null }])).toHaveLength(1);
  });
});

describe('dayAgenda (owner decision O4: everything on the day)', () => {
  const mk = (o: object) => ({ id: 'x', date: '2026-10-14', source: 'event', area: 'money', chip: '', title: '', start: null, people: [], ...o }) as never;
  const items = [
    mk({ id: 'task', title: 'Due', source: 'task' }),
    mk({ id: 'late', title: 'Late', span: true, date: '2026-10-10', endDate: '2026-10-14', late: true }),
    mk({ id: 'pm', title: 'PM', start: '3:00 PM' }),
    mk({ id: 'am', title: 'AM', start: '9:00 AM' }),
    mk({ id: 'other', date: '2026-10-15' }),
    mk({ id: 'span-before', span: true, date: '2026-10-01', endDate: '2026-10-09' }),
  ];
  it('lists timed items by time, then the rest, and includes bars that cover the day', () => {
    expect(dayAgenda(items, '2026-10-14', minutes).map((i) => i.id)).toEqual(['am', 'pm', 'task', 'late']);
  });
});

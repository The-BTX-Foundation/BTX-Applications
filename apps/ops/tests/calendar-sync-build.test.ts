import { describe, expect, it } from 'vitest';
import { addDays, buildSyncEvents, eventHash, syncWindow, type SyncEvent, type SyncRows } from '@/lib/calendar-sync/build-events';

// "Now" is Thursday Oct 22 2026, noon Eastern. The window is Sep 22 2026 (in) to Nov 26 2027 (out).
const NOW = new Date('2026-10-22T16:00:00Z');
const OPS = 'https://ops.example.org';
const FOOTER = `From the BTX Ops Hub: ${OPS}/calendar. Change it there; edits made here are replaced.`;
const DISTINCT_NAME = 'Zephyrine Quillfeather-Okonkwo';

// Empty rows with the given tables filled in.
const rows = (part: Partial<SyncRows>): SyncRows => ({
  events: [], tasks: [], assignees: [], posts: [], milestones: [], cycles: [], bookings: [], slots: [], pairings: [], apps: [], people: [], ...part,
});
const build = (part: Partial<SyncRows>) => buildSyncEvents(rows(part), NOW, OPS);
const byId = (list: SyncEvent[], id: string) => list.find((e) => e.id === id);
const people = [{ user_id: 'u1', display_name: 'Kelsey M' }, { user_id: 'u2', display_name: 'Dominick L' }];

describe('syncWindow and addDays', () => {
  it('covers 30 Eastern days back and 400 ahead', () => {
    expect(syncWindow(NOW)).toEqual({ start: '2026-09-22', end: '2027-11-26' });
    // 03:00 UTC on Oct 23 is still Oct 22 in Eastern time.
    expect(syncWindow(new Date('2026-10-23T03:00:00Z')).start).toBe('2026-09-22');
  });
  it('steps across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('calendar_events', () => {
  it('a timed event keeps its times in UTC and the owner in the description', () => {
    const [e] = build({ people, events: [{ id: 'e1', title: 'Board meeting', starts_at: '2026-10-28T23:00:00+00:00', ends_at: '2026-10-29T00:30:00+00:00', all_day: false, location: null, video_url: 'https://meet.example/abc', owner_id: 'u1' }] });
    expect(e).toMatchObject({ id: 'event:e1', title: 'Board meeting', allDay: false, start: '2026-10-28T23:00:00.000Z', end: '2026-10-29T00:30:00.000Z', location: 'https://meet.example/abc' });
    expect(e.description).toBe(`Owner: Kelsey M\n\n${FOOTER}`);
  });
  it('a timed event with no end lasts an hour; location wins over the video link', () => {
    const [e] = build({ events: [{ id: 'e2', title: 'Call', starts_at: '2026-10-28T14:00:00Z', ends_at: null, all_day: false, location: 'Room 2', video_url: 'https://v' }] });
    expect(e.end).toBe('2026-10-28T15:00:00.000Z');
    expect(e.location).toBe('Room 2');
    expect(e.description).toBe(FOOTER);
  });
  it('an all-day event sits on its Eastern day, end exclusive', () => {
    // Stored at noon Eastern, as the app saves all-day events.
    const [e] = build({ events: [{ id: 'e3', title: 'Chapter visit', starts_at: '2026-10-30T16:00:00Z', all_day: true }] });
    expect(e).toMatchObject({ allDay: true, start: '2026-10-30', end: '2026-10-31' });
  });
  it('converts to Eastern across the November 1 2026 clock change and near midnight UTC', () => {
    const list = build({
      events: [
        // 03:30 UTC Nov 1 = 11:30 PM Oct 31 EDT (UTC-4).
        { id: 'before', title: 'A', starts_at: '2026-11-01T03:30:00Z', all_day: true },
        // 04:30 UTC Nov 2 = 11:30 PM Nov 1 EST (UTC-5): the same clock offset a day earlier would have said Nov 2.
        { id: 'after', title: 'B', starts_at: '2026-11-02T04:30:00Z', all_day: true },
        // 00:30 UTC Oct 24 = 8:30 PM Oct 23 Eastern.
        { id: 'late', title: 'C', starts_at: '2026-10-24T00:30:00Z', all_day: true },
      ],
    });
    expect(byId(list, 'event:before')).toMatchObject({ start: '2026-10-31', end: '2026-11-01' });
    expect(byId(list, 'event:after')).toMatchObject({ start: '2026-11-01', end: '2026-11-02' });
    expect(byId(list, 'event:late')).toMatchObject({ start: '2026-10-23', end: '2026-10-24' });
  });
});

describe('interviews', () => {
  const part: Partial<SyncRows> = {
    people,
    bookings: [
      { id: 'b1', application_id: 'a1', slot_id: 's1', status: 'active' },
      { id: 'b2', application_id: 'a1', slot_id: 's2', status: 'released' },
      { id: 'b3', application_id: 'a-draft', slot_id: 's2', status: 'active' },
      { id: 'b4', application_id: 'a1', slot_id: 'missing', status: 'active' },
    ],
    slots: [
      { id: 's1', starts_at: '2026-11-10T15:00:00Z', ends_at: '2026-11-10T15:30:00Z' },
      { id: 's2', starts_at: '2026-11-11T15:00:00Z', ends_at: '2026-11-11T15:30:00Z' },
    ],
    pairings: [{ slot_id: 's1', interviewer_a: 'u1', interviewer_b: 'u2', video_url: 'https://meet.example/iv' }],
    // full_name and email are here on purpose: even if a loader ever passed them, they must not come out.
    apps: [{ id: 'a1', applicant_code: 'APP-2026-00015', full_name: DISTINCT_NAME, terpmail: 'zq@terpmail.umd.edu' }],
  };

  it('an active booking for a submitted application: code-only title, pair and video in the description', () => {
    const list = build(part);
    expect(list.map((e) => e.id)).toEqual(['interview:b1']);
    expect(list[0]).toMatchObject({
      title: 'BTX interview · APP-2026-00015',
      allDay: false,
      start: '2026-11-10T15:00:00.000Z',
      end: '2026-11-10T15:30:00.000Z',
      location: 'https://meet.example/iv',
      description: `Interviewers: Kelsey M, Dominick L\nVideo: https://meet.example/iv\n\n${FOOTER}`,
    });
  });

  it('never carries the applicant name or email in any field', () => {
    const text = JSON.stringify(build(part));
    expect(text).not.toContain('Zephyrine');
    expect(text).not.toContain('Quillfeather');
    expect(text).not.toContain('terpmail');
  });

  it('without a pairing: no interviewer line, no location', () => {
    const [e] = build({ ...part, pairings: [] });
    expect(e.location).toBe('');
    expect(e.description).toBe(FOOTER);
  });
});

describe('tasks', () => {
  it('keeps only open or in-progress, unarchived tasks with a due date', () => {
    const list = build({
      people,
      tasks: [
        { id: 't1', title: 'Send packet', status: 'open', due_on: '2026-10-30', archived: false },
        { id: 't2', title: 'Book room', status: 'in_progress', due_on: '2026-10-31', archived: false },
        { id: 't3', title: 'Done one', status: 'done', due_on: '2026-10-30', archived: false },
        { id: 't4', title: 'Declined', status: 'declined', due_on: '2026-10-30', archived: false },
        { id: 't5', title: 'Archived', status: 'open', due_on: '2026-10-30', archived: true },
        { id: 't6', title: 'No date', status: 'open', due_on: null, archived: false },
      ],
      assignees: [{ task_id: 't1', user_id: 'u1' }, { task_id: 't1', user_id: 'u2' }],
    });
    expect(list.map((e) => e.id)).toEqual(['task:t1', 'task:t2']);
    expect(list[0]).toMatchObject({ title: 'Due: Send packet', allDay: true, start: '2026-10-30', end: '2026-10-31', description: `Assigned to: Dominick L, Kelsey M\n\n${FOOTER}` });
    expect(list[1].description).toBe(FOOTER);
  });

  it('lists assignees alphabetically whatever order the rows come in', () => {
    const tasks = [{ id: 't1', title: 'Send packet', status: 'open', due_on: '2026-10-30', archived: false }];
    const one = build({ people, tasks, assignees: [{ task_id: 't1', user_id: 'u1' }, { task_id: 't1', user_id: 'u2' }] })[0];
    const two = build({ people, tasks, assignees: [{ task_id: 't1', user_id: 'u2' }, { task_id: 't1', user_id: 'u1' }] })[0];
    expect(two.description).toBe(one.description);
    expect(two.hash).toBe(one.hash);
  });
});

describe('posts and milestones', () => {
  it('posts with a date become one-day all-day events', () => {
    const list = build({ posts: [{ id: 'p1', title: 'Winner reveal', post_on: '2026-12-01' }, { id: 'p2', title: 'Undated', post_on: null }] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'post:p1', title: 'Post: Winner reveal', start: '2026-12-01', end: '2026-12-02', allDay: true });
  });
  it('milestones: due, not done, not archived', () => {
    const list = build({
      milestones: [
        { id: 'm1', name: 'Launch certification', due_on: '2027-01-15', done: false, archived: false },
        { id: 'm2', name: 'Done', due_on: '2027-01-15', done: true, archived: false },
        { id: 'm3', name: 'Gone', due_on: '2027-01-15', done: false, archived: true },
      ],
    });
    expect(list.map((e) => [e.id, e.title, e.start, e.end])).toEqual([['milestone:m1', 'Milestone: Launch certification', '2027-01-15', '2027-01-16']]);
  });
});

describe('cycles', () => {
  const cycle = { id: 'c1', status: 'published', opens_at: '2026-10-01T13:00:00Z', closes_at: '2026-11-03T02:00:00Z', interview_start: '2026-11-10', interview_end: '2026-11-20', decision_date: '2026-12-01' };
  it('four all-day items with the Calendar page wording; the interview window is one multi-day event', () => {
    const list = build({ cycles: [cycle] });
    expect(list.map((e) => [e.id, e.title, e.start, e.end])).toEqual([
      ['cycle:c1:opens', 'Applications open', '2026-10-01', '2026-10-02'],
      // 02:00 UTC Nov 3 is 9 PM Nov 2 Eastern.
      ['cycle:c1:closes', 'Applications close', '2026-11-02', '2026-11-03'],
      ['cycle:c1:interviews', 'Interviews, to Fri Nov 20', '2026-11-10', '2026-11-21'],
      ['cycle:c1:decision', 'Decisions', '2026-12-01', '2026-12-02'],
    ]);
    expect(list.every((e) => e.allDay)).toBe(true);
  });
  it('skips draft cycles', () => {
    expect(build({ cycles: [{ ...cycle, status: 'draft' }] })).toEqual([]);
  });
  it('skips a malformed date instead of throwing', () => {
    const list = build({ cycles: [{ ...cycle, opens_at: 'not a date' }] });
    expect(list.map((e) => e.id)).toEqual(['cycle:c1:closes', 'cycle:c1:interviews', 'cycle:c1:decision']);
  });
});

describe('window, order, hash and bad rows', () => {
  it('keeps only events overlapping the window', () => {
    const list = build({
      posts: [
        { id: 'old', title: 'x', post_on: '2026-09-21' },
        { id: 'first', title: 'x', post_on: '2026-09-22' },
        { id: 'last', title: 'x', post_on: '2027-11-25' },
        { id: 'out', title: 'x', post_on: '2027-11-26' },
      ],
      // A multi-day window that started before the edge still overlaps it.
      cycles: [{ id: 'c0', status: 'published', interview_start: '2026-09-15', interview_end: '2026-09-25' }],
      events: [
        // Ends exactly at the window start (midnight Eastern Sep 22 = 04:00 UTC): out.
        { id: 'edge', title: 'x', starts_at: '2026-09-22T03:00:00Z', ends_at: '2026-09-22T04:00:00Z', all_day: false },
        { id: 'inside', title: 'x', starts_at: '2026-09-22T03:30:00Z', ends_at: '2026-09-22T04:30:00Z', all_day: false },
      ],
    });
    expect(list.map((e) => e.id).sort()).toEqual(['cycle:c0:interviews', 'event:inside', 'post:first', 'post:last']);
  });

  it('sorts by start then id, the same every time', () => {
    const posts = [{ id: 'b', title: 'x', post_on: '2026-11-01' }, { id: 'a', title: 'x', post_on: '2026-11-01' }, { id: 'c', title: 'x', post_on: '2026-10-25' }];
    const one = build({ posts }).map((e) => e.id);
    expect(one).toEqual(['post:c', 'post:a', 'post:b']);
    expect(build({ posts: [...posts].reverse() }).map((e) => e.id)).toEqual(one);
  });

  it('the hash is stable and changes when any field changes', () => {
    const base = { id: 'p1', title: 'Reveal', post_on: '2026-12-01' };
    const h = build({ posts: [base] })[0].hash;
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(build({ posts: [base] })[0].hash).toBe(h);
    expect(build({ posts: [{ ...base, title: 'Reveal!' }] })[0].hash).not.toBe(h);
    expect(build({ posts: [{ ...base, post_on: '2026-12-02' }] })[0].hash).not.toBe(h);
    expect(buildSyncEvents(rows({ posts: [base] }), NOW, 'https://other.example')[0].hash).not.toBe(h);
    const { hash, ...rest } = build({ posts: [base] })[0];
    expect(eventHash(rest)).toBe(hash);
  });

  it('skips rows missing required fields instead of throwing', () => {
    const list = build({
      events: [{ id: 'e1', title: '', starts_at: '2026-10-28T14:00:00Z' }, { id: 'e2', title: 'x', starts_at: null }, { id: '', title: 'x', starts_at: '2026-10-28T14:00:00Z' }],
      posts: [{ id: 'p1', title: null, post_on: '2026-11-01' }, { id: 'p2', title: 'x', post_on: '11/01/2026' }],
      bookings: [{ id: 'b1', application_id: 'a1', slot_id: 's1', status: 'active' }],
      slots: [{ id: 's1', starts_at: '2026-11-10T15:00:00Z', ends_at: null }],
      apps: [{ id: 'a1', applicant_code: 'APP-2026-00001' }],
    });
    expect(list).toEqual([]);
  });
});

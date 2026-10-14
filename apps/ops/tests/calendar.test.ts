import { describe, expect, it } from 'vitest';
import { buildCalendarItems, type CalSources } from '@/lib/calendar-build';

const empty: CalSources = { events: [], interviews: [], tasks: [], posts: [], cycles: [], milestones: [] };
const TODAY = '2026-10-12';

describe('buildCalendarItems', () => {
  it('turns timed events into chips in Eastern time', () => {
    const [e] = buildCalendarItems({ ...empty, events: [{ id: 'e1', title: 'Board meeting', area: 'money', starts_at: '2026-10-13T22:00:00Z', all_day: false, video_url: 'https://x', owner_id: 'u1' }] }, TODAY);
    expect(e).toMatchObject({ id: 'ev-e1', date: '2026-10-13', source: 'event', area: 'money', chip: '6:00 Board meeting', start: '6:00 PM', people: ['u1'], video: true });
  });
  it('keeps an all-day event on its day and defaults a missing area', () => {
    const [e] = buildCalendarItems({ ...empty, events: [{ id: 'e2', title: 'Retreat', area: null, starts_at: '2026-10-20T12:00:00Z', all_day: true, video_url: null, owner_id: null }] }, TODAY);
    expect(e).toMatchObject({ date: '2026-10-20', chip: 'Retreat', start: null, area: 'scholarships', people: [] });
  });
  it('labels interviews with the code and the pair', () => {
    const [i] = buildCalendarItems({ ...empty, interviews: [{ slot_id: 's1', starts_at: '2026-10-15T14:00:00Z', code: 'APP-1', people: ['a', 'b'], video_url: null }] }, TODAY);
    expect(i).toMatchObject({ source: 'interview', chip: '10:00 Interview', title: 'Interview APP-1', people: ['a', 'b'], video: false });
  });
  it('draws a late task as a bar up to yesterday', () => {
    const [t] = buildCalendarItems({ ...empty, tasks: [{ id: 't1', title: 'Video links', area: 'scholarships', due_on: '2026-10-09', people: ['me'] }] }, TODAY);
    expect(t).toMatchObject({ date: '2026-10-09', endDate: '2026-10-11', span: true, late: true, chip: 'Video links, 3 days late' });
  });
  it('adds posts, the cycle dates with the interview window, and milestones, sorted by day', () => {
    const items = buildCalendarItems(
      {
        ...empty,
        posts: [{ id: 'p1', title: 'Meet the board', post_on: '2026-10-15', channel: 'Instagram', owner_id: 'u2' }],
        cycles: [{ id: 'c', opens_at: '2026-09-01T13:00:00Z', closes_at: null, interview_start: '2026-10-05', interview_end: '2026-10-09', decision_date: '2026-10-23' }],
        milestones: [{ id: 'm', name: 'Pilot ready', area: 'programs', due_on: '2026-11-20' }],
      },
      TODAY,
    );
    expect(items.map((i) => [i.id, i.date])).toEqual([
      ['cy-c-open', '2026-09-01'],
      ['cy-c-iv', '2026-10-05'],
      ['po-p1', '2026-10-15'],
      ['cy-c-decision', '2026-10-23'],
      ['ms-m', '2026-11-20'],
    ]);
    expect(items[1]).toMatchObject({ endDate: '2026-10-09', span: true, title: 'Interviews, to Fri Oct 9' });
    expect(items[2]).toMatchObject({ source: 'post', area: 'outreach', chip: 'Instagram', title: 'Meet the board' });
  });
  it('orders a day by time, untimed first', () => {
    const items = buildCalendarItems(
      {
        ...empty,
        events: [
          { id: 'late', title: 'B', area: null, starts_at: '2026-10-14T23:00:00Z', all_day: false, video_url: null, owner_id: null },
          { id: 'early', title: 'A', area: null, starts_at: '2026-10-14T13:00:00Z', all_day: false, video_url: null, owner_id: null },
        ],
        tasks: [{ id: 'due', title: 'Due', area: 'money', due_on: '2026-10-14', people: [] }],
      },
      TODAY,
    );
    expect(items.map((i) => i.id)).toEqual(['tk-due', 'ev-early', 'ev-late']);
  });
});

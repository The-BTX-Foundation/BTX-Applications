import { describe, expect, it, vi } from 'vitest';
import { emptySummary, type PushInterview, type PushItem, type PushSummary } from '@btx/push';
import { sendDueTomorrowPushes, sendPrepPushes } from '@/lib/push/crons';

const iv = (slotId: string, startsAt: string, users: string[]): PushInterview => ({ slotId, code: 'APP-2026-00015', startsAt, interviewers: users.map((userId) => ({ userId })) });
// 5:00 PM Eastern on Wed Nov 11. Tomorrow, in Eastern time, is Thu Nov 12.
const now = new Date('2026-11-11T22:00:00Z');

describe('sendPrepPushes', () => {
  it('pushes each interviewer once, with a count of tomorrow\'s interviews in Eastern time', async () => {
    const deliver = vi.fn<(items: PushItem[]) => Promise<PushSummary>>(async () => emptySummary(true));
    const rows = [
      iv('a', '2026-11-13T00:00:00Z', ['u1', 'u2']), // 7:00 PM Thu Nov 12 Eastern: tomorrow
      iv('b', '2026-11-12T20:00:00Z', ['u1']), // 3:00 PM Thu Nov 12 Eastern: tomorrow
      iv('c', '2026-11-12T03:00:00Z', ['u3']), // 10:00 PM Wed Nov 11 Eastern: today, not tomorrow
      iv('d', '2026-11-13T05:30:00Z', ['u4']), // 12:30 AM Fri Nov 13 Eastern: the day after
      iv('e', '2026-11-12T22:00:00Z', []), // nobody paired yet
    ];
    const interviews = vi.fn<(q: { from: string; to: string }) => Promise<PushInterview[]>>(async () => rows);
    await sendPrepPushes(now, { db: null, interviews, deliver });
    const items = deliver.mock.calls[0][0];
    expect(items.map((i) => [i.userId, i.title, i.body, i.key])).toEqual([
      ['u1', 'Interviews tomorrow', 'You have 2. Your prep is in the Ops Hub.', 'prep:2026-11-12:u1'],
      ['u2', 'Interviews tomorrow', 'You have 1. Your prep is in the Ops Hub.', 'prep:2026-11-12:u2'],
    ]);
    expect(interviews.mock.calls[0][0].from).toBe(now.toISOString());
  });

  it('sends nothing, and says so, when there is no database and nothing injected', async () => {
    expect(await sendPrepPushes(now, { db: null })).toEqual(emptySummary(false));
  });
});

describe('sendDueTomorrowPushes', () => {
  it('pushes the assignees of each task due tomorrow, with the task title', async () => {
    const deliver = vi.fn<(items: PushItem[]) => Promise<PushSummary>>(async () => emptySummary(true));
    const tasks = vi.fn<(day: string) => Promise<{ id: string; title: string; userIds: string[] }[]>>(async () => [{ id: 't1', title: 'Send the sponsor thank-you notes', userIds: ['u1', 'u2'] }]);
    await sendDueTomorrowPushes(now, { db: null, tasks, deliver });
    expect(tasks).toHaveBeenCalledWith('2026-11-12');
    expect(deliver.mock.calls[0][0].map((i) => [i.userId, i.title, i.body, i.key])).toEqual([
      ['u1', 'Due tomorrow', 'Send the sponsor thank-you notes', 'task-due:t1:2026-11-12:u1'],
      ['u2', 'Due tomorrow', 'Send the sponsor thank-you notes', 'task-due:t1:2026-11-12:u2'],
    ]);
  });

  it('sends nothing, and says so, when there is no database and nothing injected', async () => {
    expect(await sendDueTomorrowPushes(now, { db: null })).toEqual(emptySummary(false));
  });
});

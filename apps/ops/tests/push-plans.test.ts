import { describe, expect, it } from 'vitest';
import { planAvailabilityPushes, planBookedPushes, planCancelledPushes, planChatPushes, planDueTomorrowPushes, planPrepPushes, planTestPush, twoRows, type PushInterview } from '@btx/push';

const row = (over: Partial<PushInterview> = {}): PushInterview => ({ slotId: 's1', applicationId: 'a1', code: 'APP-2026-00015', startsAt: '2026-11-10T23:00:00Z', interviewers: [{ userId: 'kd' }, { userId: 'cc' }], ...over });

describe('interview pushes', () => {
  it('books: one push per interviewer, applicant number and time, two rows', () => {
    const items = planBookedPushes(row(), 'booked');
    expect(items.map((i) => i.userId)).toEqual(['kd', 'cc']);
    expect(items[0]).toMatchObject({ title: 'Interview booked', body: 'Applicant 15 · Tue Nov 10, 6:00 PM', url: '/scholarships/interviews', key: 'interview-booked:s1:a1:kd' });
  });
  it('moves: says "now" with the new time', () => {
    expect(planBookedPushes(row(), 'moved')[0]).toMatchObject({ title: 'Interview moved', body: 'Applicant 15 · now Tue Nov 10, 6:00 PM' });
  });
  it('cancels: only interviewers who are not on the new pair', () => {
    const old = row({ slotId: 'old' });
    const next = row({ slotId: 'new', interviewers: [{ userId: 'kd' }, { userId: 'zz' }] });
    expect(planCancelledPushes(old, next).map((i) => i.userId)).toEqual(['cc']);
    expect(planCancelledPushes(old).map((i) => i.userId)).toEqual(['kd', 'cc']);
    expect(planCancelledPushes(old)[0]).toMatchObject({ title: 'Interview cancelled', body: 'Applicant 15 · Tue Nov 10, 6:00 PM' });
  });
  it('keys carry the student, so the next student in the same slot with the same interviewers still gets a push', () => {
    const a = planBookedPushes(row({ applicationId: 'a1' }), 'booked').map((i) => i.key);
    const b = planBookedPushes(row({ applicationId: 'a2' }), 'booked').map((i) => i.key);
    expect(a.filter((k) => b.includes(k))).toEqual([]);
    expect(planCancelledPushes(row({ slotId: 'old', applicationId: 'a1' }))[0].key).toBe('interview-cancelled:old:a1:kd');
  });
  it('a nonce makes each booking action its own push (A, B, A, B all notify)', () => {
    expect(planBookedPushes(row(), 'moved', { nonce: 'n1' })[0].key).toBe('interview-moved:s1:a1:n1:kd');
    expect(planBookedPushes(row(), 'moved', { nonce: 'n1' })[0].key).not.toBe(planBookedPushes(row(), 'moved', { nonce: 'n2' })[0].key);
    expect(planCancelledPushes(row({ slotId: 'old' }), undefined, { nonce: 'n1' })[0].key).toBe('interview-cancelled:old:a1:n1:kd');
  });
  it('never contains a name, an email or the full code', () => {
    for (const i of [...planBookedPushes(row(), 'booked'), ...planCancelledPushes(row())]) {
      expect(`${i.title} ${i.body}`).not.toMatch(/APP-2026|@/);
    }
  });
});

describe('prep, availability, due tomorrow, chat, test', () => {
  it('counts tomorrow\'s interviews per interviewer, once per day', () => {
    const items = planPrepPushes([row({ slotId: 'a' }), row({ slotId: 'b', interviewers: [{ userId: 'kd' }] })], '2026-11-10');
    expect(items.find((i) => i.userId === 'kd')).toMatchObject({ body: 'You have 2. Your prep is in the Ops Hub.', key: 'prep:2026-11-10:kd' });
    expect(items.find((i) => i.userId === 'cc')!.body).toBe('You have 1. Your prep is in the Ops Hub.');
  });
  it('asks for availability with the close day, at most once a day each', () => {
    const [a] = planAvailabilityPushes({ cycleId: 'c1', userIds: ['u1'], closesAt: '2026-11-07T04:59:00Z', today: '2026-11-02' });
    expect(a).toMatchObject({ title: 'Give your interview availability', body: 'Add your times by Fri Nov 6', key: 'availability:c1:2026-11-02:u1', url: '/scholarships/interviews/availability' });
    expect(planAvailabilityPushes({ cycleId: 'c1', userIds: ['u1'], closesAt: null, today: '2026-11-02' })[0].body).toBe('Add your times so interviews can be booked.');
  });
  it('warns each assignee of an open task due tomorrow', () => {
    const items = planDueTomorrowPushes([{ id: 't1', title: 'Order award certificates', userIds: ['u1', 'u2'] }], '2026-11-20');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Due tomorrow', body: 'Order award certificates', key: 'task-due:t1:2026-11-20:u1', url: '/tasks' });
  });
  it('tells who wrote a chat message, never what it says', () => {
    const items = planChatPushes({ messageId: 'm1', authorName: 'Kelsey Davis', recipientIds: ['a', 'b'] });
    expect(items[0]).toMatchObject({ title: 'Board chat', body: 'Kelsey Davis sent a message.', key: 'chat:m1:a', url: '/chat' });
  });
  it('makes a test push per press', () => {
    expect(planTestPush('u1', 'n1')[0].key).toBe('test:n1:u1');
    expect(planTestPush('u1', 'n2')[0].key).not.toBe(planTestPush('u1', 'n1')[0].key);
  });
  it('every plan survives the two-row rule unchanged in length', () => {
    const all = [...planBookedPushes(row(), 'moved'), ...planPrepPushes([row()], '2026-11-10'), ...planChatPushes({ messageId: 'm', authorName: 'A'.repeat(90), recipientIds: ['a'] }), ...planDueTomorrowPushes([{ id: 't', title: 'x '.repeat(80), userIds: ['u'] }], 'd')];
    for (const i of all) {
      const w = twoRows(i);
      expect(w.title.length).toBeLessThanOrEqual(40);
      expect((w.body ?? '').length).toBeLessThanOrEqual(60);
    }
  });
});

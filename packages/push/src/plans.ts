// Who gets which push, as pure functions (no database, no clock of their own). Keys make each push go out once: the
// delivery reserves (person, key) first, so a retry, a double click or two overlapping cron runs never double up.
import { applicantNumber, clip, dayLabel, whenLabel } from './format';

export type PushItem = { userId: string; key: string; title: string; body?: string; /** An Ops Hub path; the tap opens it. */ url?: string };

/** The part of an interview the pushes need (structurally an @btx/emails InterviewRow). */
export type PushInterview = { slotId: string; applicationId: string; code: string; startsAt: string; interviewers: { userId: string }[] };

/** A nonce makes each booking action its own push (the Portal passes one per request); without it the key is stable per student and slot. */
export type KeyOptions = { nonce?: string };
const keyPart = (o?: KeyOptions) => (o?.nonce ? `:${o.nonce}` : '');

const INTERVIEWS = '/scholarships/interviews';

/**
 * "Interview booked" or "Interview moved" to each interviewer of the new slot. The key carries the student (like the email's
 * never-twice key), so a second student booking the same slot, with the same interviewers, still gets her own push.
 */
export function planBookedPushes(row: PushInterview, kind: 'booked' | 'moved', options?: KeyOptions): PushItem[] {
  const num = applicantNumber(row.code);
  const when = whenLabel(row.startsAt);
  return row.interviewers.map((p) => ({
    userId: p.userId,
    key: `interview-${kind}:${row.slotId}:${row.applicationId}${keyPart(options)}:${p.userId}`,
    title: kind === 'moved' ? 'Interview moved' : 'Interview booked',
    body: kind === 'moved' ? `${num} · now ${when}` : `${num} · ${when}`,
    url: INTERVIEWS,
  }));
}

/** "Interview cancelled" to the interviewers of the slot she left, except anyone also on the new pair (they get "moved"). */
export function planCancelledPushes(oldRow: PushInterview, newRow?: PushInterview, options?: KeyOptions): PushItem[] {
  const staying = new Set((newRow?.interviewers ?? []).map((p) => p.userId));
  const num = applicantNumber(oldRow.code);
  const when = whenLabel(oldRow.startsAt);
  return oldRow.interviewers
    .filter((p) => !staying.has(p.userId))
    .map((p) => ({ userId: p.userId, key: `interview-cancelled:${oldRow.slotId}:${oldRow.applicationId}${keyPart(options)}:${p.userId}`, title: 'Interview cancelled', body: `${num} · ${when}`, url: INTERVIEWS }));
}

/** The evening before: one push per interviewer who has interviews tomorrow, with the count. */
export function planPrepPushes(rows: PushInterview[], tomorrow: string): PushItem[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const p of r.interviewers) counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
  return [...counts].map(([userId, n]) => ({ userId, key: `prep:${tomorrow}:${userId}`, title: 'Interviews tomorrow', body: `You have ${n}. Your prep is in the Ops Hub.`, url: INTERVIEWS }));
}

/** "Give your interview availability" to each board member who has not sent it. At most one a day each. */
export function planAvailabilityPushes(o: { cycleId: string; userIds: string[]; closesAt: string | null; today: string }): PushItem[] {
  const body = o.closesAt ? `Add your times by ${dayLabel(o.closesAt)}` : 'Add your times so interviews can be booked.';
  return o.userIds.map((userId) => ({ userId, key: `availability:${o.cycleId}:${o.today}:${userId}`, title: 'Give your interview availability', body, url: '/scholarships/interviews/availability' }));
}

/** "Due tomorrow" to each assignee of an open task due tomorrow. */
export function planDueTomorrowPushes(tasks: { id: string; title: string; userIds: string[] }[], tomorrow: string): PushItem[] {
  return tasks.flatMap((t) => t.userIds.map((userId) => ({ userId, key: `task-due:${t.id}:${tomorrow}:${userId}`, title: 'Due tomorrow', body: clip(t.title, 60), url: '/tasks' })));
}

/** A Board chat message: who wrote it, never what it says. */
export function planChatPushes(o: { messageId: string; authorName: string; recipientIds: string[] }): PushItem[] {
  const who = clip(o.authorName, 40) || 'A board member';
  return o.recipientIds.map((userId) => ({ userId, key: `chat:${o.messageId}:${userId}`, title: 'Board chat', body: `${who} sent a message.`, url: '/chat' }));
}

/** The admin's "send a test push to my phone". The nonce makes each press its own push. */
export function planTestPush(userId: string, nonce: string): PushItem[] {
  return [{ userId, key: `test:${nonce}:${userId}`, title: 'Test from the Ops Hub', body: 'Pushes work on this phone.', url: '/' }];
}

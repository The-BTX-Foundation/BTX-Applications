// Turns one interview (an InterviewRow) into the emails to send for it, ready for deliverOnce(): who gets what, the
// "never twice" key, the calendar attachment. Pure: no database, no sending. Used by the Ops Hub senders and the
// Portal's booking route so both say the same thing.
import type { MailClaim } from './deliver';
import { buildInterviewIcs, icsAttachment } from './ics';
import type { InterviewRow } from './interview-data';
import { bookedEmail, cancelEmail, inviteDescription, prepEmail, rebalanceEmail, reminderEmail, videoLinkEmail, type QuestionGroup, type Rendered } from './interviews';
import type { Mail } from './send';

export type Planned = { claim: MailClaim; mail: Mail };

export type PlanContext = {
  term: string;
  award: string;
  /** The Portal's address (logo, "change your time"), no trailing slash. */
  portalUrl: string;
  /** The Ops Hub's address (scorecard link), no trailing slash. */
  opsUrl?: string;
  now?: Date;
};

const first = (name: string) => name.trim().split(/\s+/)[0] || 'there';
const scorecard = (c: PlanContext) => `${(c.opsUrl ?? '').replace(/\/+$/, '')}/scholarships/scoring`;
export const changeTimeUrl = (portalUrl: string) => `${portalUrl.replace(/\/+$/, '')}/status/change`;

function calendar(row: InterviewRow, method: 'REQUEST' | 'CANCEL', who: { email: string; name: string }, c: PlanContext) {
  const ics = buildInterviewIcs({
    slotId: row.slotId,
    method,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    description: inviteDescription({ applicantName: row.applicantName, code: row.code, interviewers: row.interviewers.map((p) => p.name), videoUrl: row.videoUrl }),
    videoUrl: row.videoUrl,
    attendees: [who],
    now: c.now,
  });
  return [icsAttachment(ics, method)];
}

const planned = (kind: MailClaim['kind'], row: InterviewRow, email: string, r: Rendered, recipient: string, attachments?: Mail['attachments']): Planned => ({
  claim: { kind, cycle_id: row.cycleId, application_id: row.applicationId, slot_id: row.slotId, recipient, to_address: email },
  mail: { to: email, subject: r.subject, html: r.html, text: r.text, ...(attachments ? { attachments } : {}) },
});

const base = (row: InterviewRow, c: PlanContext) => ({ term: c.term, award: c.award, origin: c.portalUrl.replace(/\/+$/, ''), startsAt: row.startsAt, endsAt: row.endsAt, videoUrl: row.videoUrl, code: row.code, applicantName: row.applicantName });

/** "Your interview is booked" to the student and to each interviewer, with the calendar invite. */
export function planBooked(row: InterviewRow, c: PlanContext): Planned[] {
  const out: Planned[] = [];
  const names = row.interviewers.map((p) => p.name);
  const sm = bookedEmail({ ...base(row, c), audience: 'student', firstName: first(row.applicantName), others: names, changeUrl: changeTimeUrl(c.portalUrl) });
  out.push(planned('booked', row, row.applicantEmail, sm, row.applicantEmail.toLowerCase(), calendar(row, 'REQUEST', { email: row.applicantEmail, name: row.applicantName }, c)));
  for (const p of row.interviewers) {
    if (!p.email) continue;
    const other = row.interviewers.filter((x) => x.userId !== p.userId).map((x) => x.name);
    const m = bookedEmail({ ...base(row, c), audience: 'interviewer', firstName: first(p.name), others: other });
    out.push(planned('booked', row, p.email, m, p.email.toLowerCase(), calendar(row, 'REQUEST', { email: p.email, name: p.name }, c)));
  }
  return out;
}

/** "This interview moved" with a CANCEL invite, to the interviewers of the slot she left. */
export function planCancel(oldRow: InterviewRow, c: PlanContext): Planned[] {
  return oldRow.interviewers
    .filter((p) => p.email)
    .map((p) => {
      const m = cancelEmail({ term: c.term, award: c.award, origin: c.portalUrl.replace(/\/+$/, ''), firstName: first(p.name), applicantName: oldRow.applicantName, code: oldRow.code, startsAt: oldRow.startsAt });
      return planned('cancel', oldRow, p.email!, m, p.email!.toLowerCase(), calendar(oldRow, 'CANCEL', { email: p.email!, name: p.name }, c));
    });
}

/** The video link to the student and each interviewer. A new link is a new email; the same link twice is one. */
export function planVideoLink(row: InterviewRow, c: PlanContext): Planned[] {
  if (!row.videoUrl) return [];
  const out: Planned[] = [];
  const key = (email: string) => `${email.toLowerCase()}|${row.videoUrl}`;
  const url = row.videoUrl;
  out.push(planned('video-link', row, row.applicantEmail, videoLinkEmail({ ...base(row, c), videoUrl: url, audience: 'student', firstName: first(row.applicantName) }), key(row.applicantEmail)));
  for (const p of row.interviewers) {
    if (p.email) out.push(planned('video-link', row, p.email, videoLinkEmail({ ...base(row, c), videoUrl: url, audience: 'interviewer', firstName: first(p.name) }), key(p.email)));
  }
  return out;
}

/** The prep email for each interviewer: everything for tomorrow's interview in one email. */
export function planPrep(row: InterviewRow, questions: QuestionGroup[], c: PlanContext): Planned[] {
  return row.interviewers
    .filter((p) => p.email)
    .map((p) => {
      const other = row.interviewers.find((x) => x.userId !== p.userId);
      const m = prepEmail({ ...base(row, c), firstName: first(p.name), otherName: other?.name ?? 'another board member', answers: row.answers, scorecardUrl: scorecard(c), questions });
      return planned('prep', row, p.email!, m, p.email!.toLowerCase(), calendar(row, 'REQUEST', { email: p.email!, name: p.name }, c));
    });
}

/** The student's reminder, the day before. */
export function planReminder(row: InterviewRow, c: PlanContext): Planned[] {
  const m = reminderEmail({ ...base(row, c), firstName: first(row.applicantName), interviewers: row.interviewers.map((p) => p.name), changeUrl: changeTimeUrl(c.portalUrl) });
  return [planned('reminder', row, row.applicantEmail, m, row.applicantEmail.toLowerCase())];
}

/**
 * The two rebalance notes for one move: the interviewer added ("You're now interviewing ...", with a REQUEST invite) and
 * the one removed (with a CANCEL invite). `row` is the interview AFTER the move; `from` is the person who left.
 * The recipient key carries the direction, so someone added and later removed from the same slot gets both emails.
 */
export function planRebalance(row: InterviewRow, move: { from: { name: string; email: string | null }; toUserId: string }, c: PlanContext): Planned[] {
  const out: Planned[] = [];
  const added = row.interviewers.find((p) => p.userId === move.toUserId);
  if (added?.email) {
    const other = row.interviewers.find((p) => p.userId !== added.userId);
    const m = rebalanceEmail({ ...base(row, c), change: 'added', firstName: first(added.name), otherName: other?.name, scorecardUrl: scorecard(c) });
    out.push(planned('rebalance', row, added.email, m, `${added.email.toLowerCase()}|added`, calendar(row, 'REQUEST', { email: added.email, name: added.name }, c)));
  }
  if (move.from.email) {
    const m = rebalanceEmail({ ...base(row, c), change: 'removed', firstName: first(move.from.name) });
    out.push(planned('rebalance', row, move.from.email, m, `${move.from.email.toLowerCase()}|removed`, calendar(row, 'CANCEL', { email: move.from.email, name: move.from.name }, c)));
  }
  return out;
}

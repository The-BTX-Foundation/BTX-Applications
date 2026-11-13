// Pure mapping for the refreshed Today page (lib/today-view.ts): raw database rows in, contract pieces out. No server imports,
// so every function is unit tested with sample rows (tests/today-live.test.ts). lib/today-live.ts does the reads and calls these.
// Rule: never invent data. Where a real field does not exist the piece is null / empty / false and the page hides it in live mode.
import { easternIso } from './cycle-core';
import { dollars } from './daily-tasks';
import { dateOnlyLabel, timeLabel } from './format';
import { isVideoLinksTask } from './area-map';
import { whenLine } from './interview-times';
import type { TaskItem } from './tasks-shared';
import type { AreaRow, BookingNeeds, ChatPreview, InterviewTicket, ScheduleLine, TodayCaps, TodayTask, TodayTaskKind } from './today-view';

export type Raw = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const orNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/** Where each kind of task sends the person (the old Today's links, kept). */
export const HREF = {
  approval: '/finance/budget/approval',
  request: '/scholarships/interviews',
  scoring: '/scholarships/scoring',
  questions: '/scholarships/interviews/questions',
  videoLinks: '/scholarships/interviews',
} as const;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Dates                                                                                                              */

/** "Tue, Nov 10" for an Eastern calendar day ("2026-11-10"). */
export function dateLabel(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Tasks                                                                                                              */

/** The Today task that opens a schedule under it ("Share the interview schedule"). There is no task type for it, so the title decides. */
export function isScheduleTask(title: string): boolean {
  return /\b(share|send)\b.*\binterview schedule\b/i.test(title);
}

/** An interview-prep task ("Prep for Ada's interview"). There is no task type for it, so the title decides. */
export function isPrepTask(title: string): boolean {
  return /\bprep(are)?\b/i.test(title) && /\binterviews?\b/i.test(title);
}

/** The row's kind: the task type first (approval, request, scoring, post), then the title for schedule and prep, else a plain task. */
export function taskKind(t: { type: string; title: string }): TodayTaskKind {
  if (t.type === 'approval') return 'approval';
  if (t.type === 'request') return 'request';
  if (t.type === 'scoring') return 'scoring';
  if (t.type === 'post') return 'post';
  if (isScheduleTask(t.title)) return 'schedule';
  if (isPrepTask(t.title)) return 'prep';
  return 'task';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where an approval is decided: the approval page for THAT quarter plan (`?plan=<budget_quarter_plans id>`). Without a plan id
 * (mock data, or a task whose checklist has no plan) the bare page, which opens the plan awaiting approval.
 */
export function approvalHref(planId?: string | null): string {
  return planId && UUID.test(planId) ? `${HREF.approval}?plan=${planId}` : HREF.approval;
}

/** The one quiet link on a row, or null when the task has none. */
export function taskLink(kind: TodayTaskKind, title: string, planId?: string | null): TodayTask['link'] {
  if (kind === 'approval') return { label: 'Review', href: approvalHref(planId) };
  if (kind === 'request') return { label: 'Add times', href: HREF.request };
  if (kind === 'scoring') return { label: 'Score', href: HREF.scoring };
  if (kind === 'prep') return { label: 'Open questions', href: HREF.questions };
  if (kind === 'task' && isVideoLinksTask(title)) return { label: 'Add links', href: HREF.videoLinks };
  return null;
}

/**
 * One open task as a Today row. `schedule` is the lines to show under a share-the-schedule task (null for every other task).
 * `waiting` is always null: nothing in `tasks` says a task waits on a named person, so the "Waiting on others" group and the
 * nudge stay hidden in live mode.
 */
export function mapTask(t: Pick<TaskItem, 'id' | 'title' | 'type' | 'area_name' | 'due_on' | 'comment_count'> & { approval?: { planId?: string } }, schedule: ScheduleLine[] | null = null): TodayTask {
  const kind = taskKind(t);
  return {
    id: t.id,
    title: t.title,
    areaName: t.area_name,
    dueOn: t.due_on,
    kind,
    link: taskLink(kind, t.title, t.approval?.planId),
    videoLinks: kind === 'task' && isVideoLinksTask(t.title),
    waiting: null,
    schedule: kind === 'schedule' && schedule && schedule.length > 0 ? schedule : null,
    commentCount: t.comment_count,
  };
}

/** The viewer's own open tasks (owned by them, or given to all board members), soonest due first, undated last. */
export function mapTasks(items: (Pick<TaskItem, 'id' | 'title' | 'type' | 'area_name' | 'due_on' | 'comment_count' | 'mine'> & { approval?: { planId?: string } })[], schedule: ScheduleLine[] | null = null): TodayTask[] {
  return items
    .filter((t) => t.mine)
    .sort((a, b) => (a.due_on ?? '9999-12-31').localeCompare(b.due_on ?? '9999-12-31') || a.title.localeCompare(b.title))
    .map((t) => mapTask(t, schedule));
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Interview booking, tickets, schedule                                                                               */

/** Matches a slot id to its time ("interview_slots": id, starts_at, ends_at, opened_at). */
export type SlotRow = { id: string; starts_at: string; ends_at: string; opened_at: string | null };
export type Pairing = { slot_id: string; interviewer_a: string; interviewer_b: string };
/** An active booking and the applicant it belongs to (`bookings` joined by hand to `applications`). */
export type BookedInterview = { slotId: string; applicationId: string; code: string; name: string; startsAt: string; endsAt: string; interviewerA: string | null; interviewerB: string | null };

/** The applicant's full name (staff see names), else their code. */
export function applicantName(a: { full_name?: unknown; applicant_code?: unknown }): string {
  return str(a.full_name).trim() || str(a.applicant_code) || 'Applicant';
}

/**
 * Joins active bookings to their slot, applicant and pairing. A booking whose slot or applicant cannot be read is left out
 * (never guessed). Sorted by start time.
 */
export function joinBooked(bookings: Raw[], slots: Raw[], applications: Raw[], pairings: Raw[]): BookedInterview[] {
  const slotBy = new Map(slots.map((s) => [str(s.id), s]));
  const appBy = new Map(applications.map((a) => [str(a.id), a]));
  const pairBy = new Map(pairings.map((p) => [str(p.slot_id), p]));
  const out: BookedInterview[] = [];
  for (const b of bookings) {
    if (b.status !== undefined && b.status !== 'active') continue;
    const slot = slotBy.get(str(b.slot_id));
    const app = appBy.get(str(b.application_id));
    if (!slot || !app) continue;
    const pair = pairBy.get(str(b.slot_id));
    out.push({
      slotId: str(b.slot_id),
      applicationId: str(b.application_id),
      code: str(app.applicant_code) || '—',
      name: applicantName(app),
      startsAt: str(slot.starts_at),
      endsAt: str(slot.ends_at),
      interviewerA: pair ? str(pair.interviewer_a) : null,
      interviewerB: pair ? str(pair.interviewer_b) : null,
    });
  }
  return out.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

/**
 * The booking card. `cycle` is the published cycle (null = none). The card shows only while students are booking (at least one
 * interview time has been opened to them) and someone has not booked yet. `dueOn` is the cycle's interview_end: the Portal's
 * "Pick a time by" date uses it (migration 20261013090100). `remindedAt` and `suggestion` are null: no student-reminder send exists.
 */
export function mapNeeds(a: { cycle: { id: string; interview_end?: unknown } | null; submitted: Raw[]; activeBookings: Raw[]; slots: Raw[] }): BookingNeeds | null {
  const c = a.cycle;
  if (!c) return null;
  const opened = a.slots.some((s) => str(s.cycle_id) === c.id && orNull(s.opened_at) !== null);
  if (!opened) return null;
  const apps = a.submitted.filter((x) => str(x.cycle_id) === c.id);
  if (apps.length === 0) return null;
  const booked = new Set(a.activeBookings.filter((b) => b.status === 'active').map((b) => str(b.application_id)));
  const unbooked = apps
    .filter((x) => !booked.has(str(x.id)))
    .map((x) => ({ id: str(x.id), name: applicantName(x) }))
    .sort((p, q) => p.name.localeCompare(q.name));
  if (unbooked.length === 0) return null;
  return { title: 'Interview booking', dueOn: orNull(c.interview_end), booked: apps.length - unbooked.length, total: apps.length, unbooked, remindedAt: null, suggestion: null };
}

/** Names by user id from staff_profiles rows. */
export function nameMap(people: { user_id: string; display_name: string }[]): Map<string, string> {
  return new Map(people.map((p) => [p.user_id, p.display_name]));
}

/** "You + Keith Dawson", or "Camila Keane + Miles Donovan"; "Not paired yet" when nobody is paired. */
export function pairLabel(b: BookedInterview, me: string, names: Map<string, string>): string {
  if (!b.interviewerA || !b.interviewerB) return 'Not paired yet';
  const nm = (id: string) => (id === me ? 'You' : (names.get(id) ?? 'Board member'));
  // The viewer first, so it always reads "You + Keith".
  const ids = b.interviewerA === me ? [b.interviewerA, b.interviewerB] : b.interviewerB === me ? [b.interviewerB, b.interviewerA] : [b.interviewerA, b.interviewerB];
  return `${nm(ids[0])} + ${nm(ids[1])}`;
}

/** The lines under "Share the interview schedule": every interview still ahead (after `now`), soonest first. */
export function mapScheduleLines(booked: BookedInterview[], me: string, names: Map<string, string>, now: Date): ScheduleLine[] {
  return booked
    .filter((b) => new Date(b.startsAt) > now)
    .map((b) => ({ name: b.name, code: b.code, whenLabel: whenLine(b.startsAt), pair: pairLabel(b, me, names), yours: b.interviewerA === me || b.interviewerB === me }));
}

/** A task that may be the viewer's prep for an interview (`tasks` row plus whether it is the viewer's). */
export type PrepCandidate = { id: string; title: string; status: string; due_on: string | null };

/**
 * The viewer's prep task for one applicant: a prep-for-interview task of theirs whose title names the applicant (full name or
 * code). No match = null, so the ticket draws no Prepped mark. `done` follows the task's status.
 */
export function findPrep(applicant: { name: string; code: string }, candidates: PrepCandidate[]): InterviewTicket['prep'] {
  const name = applicant.name.toLowerCase();
  const code = applicant.code.toLowerCase();
  const first = name.split(/\s+/)[0];
  const hit = candidates.find((c) => {
    if (!isPrepTask(c.title)) return false;
    const t = c.title.toLowerCase();
    return (code !== '—' && t.includes(code)) || t.includes(name) || (first.length > 2 && new RegExp(`\\b${first.replace(/[^a-z0-9]/g, '')}\\b`).test(t));
  });
  return hit ? { done: hit.status === 'done', dueOn: hit.due_on, href: HREF.questions, taskId: hit.id } : null;
}

/** The viewer's interviews still ahead as tickets: booked, paired with the viewer, starting after `now`. */
export function mapTickets(booked: BookedInterview[], me: string, names: Map<string, string>, now: Date, prepTasks: PrepCandidate[]): InterviewTicket[] {
  return booked
    // Kept until the interview ENDS (ends_at), so the ticket stays through the interview itself.
    .filter((b) => new Date(b.endsAt || b.startsAt) > now && (b.interviewerA === me || b.interviewerB === me))
    .map((b) => {
      const otherId = b.interviewerA === me ? b.interviewerB : b.interviewerA;
      const minutes = Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000);
      return {
        id: b.slotId,
        applicantName: b.name,
        code: b.code,
        startsAt: b.startsAt,
        minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
        // Every BTX interview is on video (the interviews page says so); the table has no "mode" column.
        mode: 'Video',
        withName: otherId ? (names.get(otherId) ?? 'Board member') : '',
        prep: findPrep({ name: b.name, code: b.code }, prepTasks),
      };
    });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Areas                                                                                                              */

export type AreaInput = {
  /** The cycle in play (published, else newest): interview_end and scored / total applications (scored = 2 or more published scores). */
  cycle: { interviewEnd: string | null; scored: number; applications: number } | null;
  fundsCents: number | null;
  raisedCents: number;
  raiseTargetCents: number | null;
  /** programs.kind of the program in play and its status. */
  programName: string | null;
  programStatus: string | null;
  /** "Thu Oct 22" of the next planning call, or null. */
  planningCall: string | null;
  monthName: string;
  postsPlanned: number;
  postsDone: number;
  /** "Thu Nov 12" of the next unposted post, or null. */
  nextPost: string | null;
};

const PROGRAM_NAME: Record<string, string> = { certification: 'Certifications', mentorship: 'Mentorship', sponsorship: 'Sponsorships' };
const PROGRAM_STATUS: Record<string, string> = { planned: 'planned', setting_up: 'in setup', active: 'active', paused: 'paused', ended: 'ended' };

/**
 * The four Areas rows. Rings are gone: Scholarships is a bar (scored of total), Outreach is squares (posts done of planned),
 * Finance and Programs are text. `right` on the bar is null: there is no "scores due" date in the tables. Rows keep the old order.
 */
export function mapAreas(f: AreaInput): AreaRow[] {
  const scored = f.cycle?.scored ?? 0;
  const total = f.cycle?.applications ?? 0;
  const program = f.programName ? (PROGRAM_NAME[f.programName] ?? f.programName) : null;
  const status = f.programStatus ? (PROGRAM_STATUS[f.programStatus] ?? f.programStatus) : null;
  return [
    {
      id: 'scholarships',
      name: 'Scholarships',
      icon: 'scholarships',
      href: '/scholarships/cycle',
      mark: { kind: 'bar', done: scored, total, left: `${scored} of ${total} scored`, right: null, title: `${scored} of ${total} applications scored` },
      peek: f.cycle?.interviewEnd ? `Interviews run to ${dateOnlyLabel(f.cycle.interviewEnd)}` : 'No interview dates yet',
    },
    {
      id: 'money',
      name: 'Finance',
      icon: 'money',
      href: '/finance/budget',
      mark: { kind: 'text', text: f.fundsCents === null ? 'Funds not set' : `${dollars(f.fundsCents)} on hand` },
      peek: f.raiseTargetCents ? `${dollars(f.raisedCents)} of ${dollars(f.raiseTargetCents)} raised` : `${dollars(f.raisedCents)} raised`,
    },
    {
      id: 'programs',
      name: 'Programs',
      icon: 'programs',
      href: '/programs/certifications',
      mark: { kind: 'text', text: program ? `${program}${status ? ` ${status}` : ''}` : 'No programs yet' },
      peek: f.planningCall ? `Planning call ${f.planningCall}` : 'No planning call set',
    },
    {
      id: 'outreach',
      name: 'Outreach',
      icon: 'outreach',
      href: '/outreach/plan',
      mark: { kind: 'squares', done: f.postsDone, total: f.postsPlanned, left: `${f.postsDone} of ${f.postsPlanned} ${f.monthName} posts` },
      peek: f.nextPost ? `Next post ${f.nextPost}` : 'No post scheduled',
    },
  ];
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Board chat                                                                                                         */

/**
 * The Board chat card: the newest message in an AREA channel (`areaChannelIds`; direct conversations are ignored), `mine` when the
 * viewer wrote it, the viewer's unread total (the same number as the sidebar pill) and the channel a reply goes to (the newest message's channel;
 * null when there is no message yet, so no reply box). A bot post reads "BTX".
 */
export function mapChat(a: { messages: Raw[]; unread: Raw[]; people: { user_id: string; display_name: string; initials: string }[]; me: string; areaChannelIds: string[] }): ChatPreview {
  const unread = a.unread.reduce((s, u) => s + Number(u.unread ?? 0), 0);
  // Area channels only: a direct (private) conversation is never shown as "Board chat" and never receives the reply.
  const area = new Set(a.areaChannelIds);
  const newest = [...a.messages]
    .filter((m) => area.has(str(m.channel_id))).sort((x, y) => str(y.created_at).localeCompare(str(x.created_at)))[0];
  if (!newest) return { channelId: null, unread, latest: null };
  const bot = newest.is_bot === true;
  const author = newest.author_id ? a.people.find((p) => p.user_id === str(newest.author_id)) : undefined;
  return {
    channelId: str(newest.channel_id),
    unread,
    latest: {
      from: bot ? 'BTX' : (author?.display_name ?? 'Someone'),
      initials: bot ? 'BT' : (author?.initials ?? ''),
      timeLabel: timeLabel(str(newest.created_at)),
      text: str(newest.body),
      mine: !bot && str(newest.author_id) === a.me,
    },
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Caps                                                                                                               */

/**
 * Which controls are drawn in live mode (a control with no real write is not drawn):
 *  - done:   true. writeStatus() updates tasks.status/completed_at; board and admin may update tasks (RLS).
 *  - add:    true. writeTask() inserts a tasks row and its task_assignees row.
 *  - snooze: true. tasks.due_on is a plain writable date column.
 *  - reply:  true only when the card has a channel (a latest message exists): postMessage() inserts into chat_messages there.
 *  - nudge:  false for now. Nothing in the tables says a task waits on a person (`waiting` is always null), and a nudge must open a
 *            direct channel with that person (open_direct_channel), never post to "the latest channel" (review 2026-11-11).
 *  - remind: false always. No send to students who have not booked exists.
 *  - approveInPlace: false always. An approval is only approved on /finance/budget/approval (approvePlan); a bare `status = 'done'`
 *            would make it vanish for the whole board while the plan stays "awaiting approval" (review 2026-11-11, finding 1).
 */
export function mapCaps(chat: ChatPreview): TodayCaps {
  const hasChannel = chat.channelId !== null;
  return { done: true, add: true, snooze: true, remind: false, nudge: false, reply: hasChannel, approveInPlace: false };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Availability request                                                                                               */

/**
 * The prompt "Give your interview availability by Fri Nov 6": shown to a board member who has not sent their availability for a
 * cycle whose interviews have not ended. Same show/hide rules as lib/availability-today.ts. It is not a stored task (`stored: false`),
 * so the page draws no check and no snooze. `dueOn` is the Eastern date of the cycle's closes_at, or null.
 */
export function mapAvailabilityRequest(a: { cycle: { id: string; closesAt: string | null; interviewStart: string | null; interviewEnd: string | null } | null; sentAt: string | null; today: string }): TodayTask | null {
  const c = a.cycle;
  if (!c || a.sentAt || !c.interviewStart || !c.interviewEnd || c.interviewEnd < a.today) return null;
  const due = c.closesAt ? easternIso(c.closesAt) : null;
  return {
    id: `availability-${c.id}`,
    title: `Give your interview availability${due ? ` by ${dateOnlyLabel(due)}` : ''}`,
    areaName: 'Scholarships',
    dueOn: due,
    kind: 'request',
    link: { label: 'Add times', href: '/scholarships/interviews/availability' },
    videoLinks: false,
    waiting: null,
    schedule: null,
    commentCount: 0,
    stored: false,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Eastern day edges                                                                                                  */

/**
 * The instant (ISO, UTC) at which an Eastern calendar day ("2026-11-10") starts, so a timestamp can be compared with "today"
 * in Eastern time. DST-safe: tries both Eastern offsets (EST 5h, EDT 4h) and keeps the one that lands on midnight of that day.
 */
export function easternStartOfDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  for (const hours of [4, 5]) {
    const t = new Date(Date.UTC(y, m - 1, d, hours));
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === day && p.hour === '00') return t.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, 5)).toISOString();
}

/** The next planning call at or after the start of `today` (Eastern): a 7 PM call last night is not "next". Rows need `starts_at`. */
export function nextPlanningCall(calls: Raw[], today: string): Raw | null {
  const from = Date.parse(easternStartOfDay(today));
  return [...calls].sort((a, b) => str(a.starts_at).localeCompare(str(b.starts_at))).find((c) => Date.parse(str(c.starts_at)) >= from) ?? null;
}

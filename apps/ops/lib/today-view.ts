// The Today page's data in the shape the refreshed page draws (Ops Hub refresh, signed off 2026-11-11).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-today-states/index.html (the demo, source of truth
// for look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/today/*) and the loaders (mock/today.ts for mock mode,
// lib/today.ts for live mode). It holds types only, no logic. Dates travel as ISO strings; the page works out the plain-word
// labels ("1 day late", "Tomorrow", "Thu") from `today` so mock mode stays stable and server and browser always agree.
import type { OpsIconName } from '@/components/icons';

/** The four areas that have a row under "Areas" (ids match lib/nav.ts group ids). */
export type AreaId = 'scholarships' | 'money' | 'programs' | 'outreach';

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo).
 * Live mode: true only where a real write exists behind the control. A false flag means the control is NOT drawn
 * (no dead controls, owner rule 2026-10-22).
 */
export type TodayCaps = {
  /** Tick a task done, with the 5-second Undo. */
  done: boolean;
  /** "Add a task" in place. */
  add: boolean;
  /** Snooze a task (moves its due date to tomorrow or next Monday). */
  snooze: boolean;
  /** "Remind the N" students who have not booked. */
  remind: boolean;
  /** "Nudge <person>" on a task that waits on someone: a drafted message sent in Board chat. */
  nudge: boolean;
  /**
   * An approval row can be ticked done in place (the sample view does this). LIVE MODE MUST BE FALSE: an approval is only
   * approved on /finance/budget/approval (lib/money-writes.ts approvePlan); a bare `tasks.status = 'done'` would make the
   * reminder vanish for the whole board while the budget plan stays "awaiting approval". With false the row draws no check
   * and no snooze, only its "Review" link.
   */
  approveInPlace: boolean;
  /** The reply box under the latest Board chat message. */
  reply: boolean;
};

/** The one card that says what needs the viewer first: interview booking (21 steps, one gold action). Null = no card. */
export type BookingNeeds = {
  /** "Interview booking". */
  title: string;
  /** ISO date bookings close; the page writes "Due Thu" and, on hover, the full date. Null = no due date. */
  dueOn: string | null;
  booked: number;
  total: number;
  /** Students who have not booked, full names (staff see names). Length is total - booked. Shown under "See who". */
  unbooked: { id: string; name: string }[];
  /** ISO instant today's reminder went out, or null if none yet. */
  remindedAt: string | null;
  /** The line under the card once a reminder went out ("Remind again Thu if still unbooked"), or null. */
  suggestion: string | null;
};

/** What kind of row a task is; picks the icon and which inline actions it gets. */
export type TodayTaskKind = 'task' | 'approval' | 'post' | 'schedule' | 'prep' | 'request' | 'scoring';

/** One line of the interview schedule that opens under the "Share the interview schedule" task. */
export type ScheduleLine = {
  name: string;
  /** "APP-2026-00011". */
  code: string;
  /** "Thu Nov 12, 5:30 PM". */
  whenLabel: string;
  /** "You + Keith Dawson" or "Camila Keane + Miles Donovan". */
  pair: string;
  /** True when the viewer is one of the two interviewers (draws the gold edge). */
  yours: boolean;
};

/** One open task of the viewer's (approvals included). */
export type TodayTask = {
  id: string;
  title: string;
  /** "Scholarships": shown as text in the row's eyebrow. */
  areaName: string;
  /** ISO date ("2026-11-12"), or null for no date. */
  dueOn: string | null;
  kind: TodayTaskKind;
  /** The one quiet link on the row ("Open questions", "Review", "Add times", "Score"), or null. */
  link: { label: string; href: string } | null;
  /** The admin-only "Send interview video links" task: its link opens the existing video-links panel instead of navigating. */
  videoLinks: boolean;
  /** Set when the task waits on someone else: puts it under "Waiting on others" and offers the nudge. */
  waiting: { /** "Keith" */ on: string; /** "caption" */ what: string; /** Board member the nudge goes to (user id), or null. */ userId: string | null; /** The drafted message. */ draft: string } | null;
  /** Rows under "Schedule" on the share-the-schedule task, else null. */
  schedule: ScheduleLine[] | null;
  commentCount: number;
  /**
   * False for a row that is a prompt, not a stored task (the "Give your interview availability" request): it has no check and no
   * snooze, because there is no task row to update. Missing means true.
   */
  stored?: boolean;
};

/** One interview of the viewer's, drawn as a ticket. */
export type InterviewTicket = {
  id: string;
  applicantName: string;
  /** "APP-2026-00011". */
  code: string;
  /** ISO instant the interview starts; the page formats it in Eastern time. */
  startsAt: string;
  minutes: number;
  /** "Video". */
  mode: string;
  /** The other interviewer's full name. */
  withName: string;
  /**
   * Prep state: null = no prep task. `taskId` is the prep task in `tasks` (when the viewer ticks that task done the ticket
   * shows "Prepped"); `done` is the state when the page loads; `href` is "Open questions".
   */
  prep: { done: boolean; dueOn: string | null; href: string; taskId: string | null } | null;
};

/** The mark that sits under an area's name. */
export type AreaMark =
  | { kind: 'bar'; done: number; total: number; /** "0 of 21 scored" */ left: string; /** "scores due Sun" */ right: string | null; /** Hover and screen-reader text. */ title: string }
  | { kind: 'squares'; done: number; total: number; /** "2 of 4 November posts" */ left: string }
  | { kind: 'text'; /** "$18,600 on hand" */ text: string };

/** One row under "Areas". */
export type AreaRow = {
  id: AreaId;
  name: string;
  icon: OpsIconName;
  href: string;
  mark: AreaMark;
  /** The line that opens under the row ("Interviews run to Fri Nov 20"). */
  peek: string;
};

/** The Board chat panel: the latest message and a reply box. */
export type ChatPreview = {
  /** chat_channels.id the reply goes to; null = no channel yet (no reply box). */
  channelId: string | null;
  unread: number;
  latest: { from: string; initials: string; /** "9:12 AM" */ timeLabel: string; text: string; /** True when the viewer wrote it (the reply box then says "Reply", not "Reply to <you>"). Missing means false. */ mine?: boolean } | null;
};

/** Everything the Today page draws. */
export type TodayView = {
  /** Eastern-time calendar day the data was built for ("2026-11-10"). The page counts "1 day late" etc. from this. */
  today: string;
  /** "Tue, Nov 10". */
  dateLabel: string;
  needs: BookingNeeds | null;
  /** The viewer's open tasks, approvals included (the Approvals tab is the `kind: 'approval'` rows). */
  tasks: TodayTask[];
  /** Open tasks across the team, for the Team tab's "7 open" line. */
  teamOpen: number;
  /** True when the tasks could not be read: the panel shows "Your tasks didn't load" with Try again, the rest still draws. */
  tasksFailed: boolean;
  interviews: InterviewTicket[];
  areas: AreaRow[];
  chat: ChatPreview;
  caps: TodayCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card). */
export type TodayResultV2 = (TodayView & { failed: false }) | { failed: true };

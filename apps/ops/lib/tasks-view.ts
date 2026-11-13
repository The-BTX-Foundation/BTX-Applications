// The refreshed Tasks page's data contract (Ops Hub refresh, demo p-tasks). One shape for both modes: mock mode fills it
// from mock/tasks-view.ts (the demo's sample day, Tue Nov 10, 2026), live mode from the real tables through the pure
// mapping in lib/tasks-map.ts. Rule: never invent data. Where a real field does not exist the piece is null or empty and
// the matching `caps` flag is false, so the page does not draw a control that has no write behind it.
import type { ScheduleLine } from './today-view';

export type { ScheduleLine };

/** What a row is, for its icon and kind word (the demo's kindOf). `request` is the availability prompt, not a stored task. */
export type TasksKind = 'approval' | 'post' | 'scoring' | 'schedule' | 'prep' | 'remind' | 'request' | 'task';

/** A board member (staff_profiles). `first` is the first name used in "Reply to Keith". */
export type TasksPerson = { id: string; name: string; first: string; initials: string };

/** One comment under a task. `at` is already in words ("Mon 4:40 PM", "Nov 3", "just now"). */
export type TasksComment = { id: string; by: string | null; at: string; body: string };

/** One checklist step (mock only: live has no per-step read on this page, so it carries the line instead). */
export type ChecklistStep = { label: string; done: boolean };

/** An approval's plan as the detail draws it. Year figures are null when they are not known (then no year bar). */
export type ApprovalPlan = {
  /** "Q4 plan, October to December" */
  heading: string;
  /** One plain sentence under the heading. */
  summary: string;
  totalCents: number;
  spentCents: number | null;
  yearCents: number | null;
  lines: { label: string; cents: number; isNew?: boolean }[];
  /** "Approving sets the budget for October to December." */
  hint: string;
  /** "Approve $4,830 for Q4" */
  approveLabel: string;
  /** The line shown after approving (mock only). */
  afterHint: string;
  /** Who a decline goes back to (mock only; null when not known). */
  askName: string | null;
  /** Where the approval is really decided (always /finance/budget/approval). */
  href: string;
};

/** Someone a task waits on (mock only: nothing in `tasks` says a task waits on a named person). */
export type TasksWaiting = { first: string; name: string; what: string; draft: string };

/** "Remind the 16": students who have not booked (mock only). */
export type TasksRemind = { count: number; draft: string };

/** One task as the page draws it. */
export type TasksTask = {
  id: string;
  title: string;
  kind: TasksKind;
  /** The area's shown name ("Finance"), or '' when none. */
  areaName: string;
  /** "2026-11-12", or null for no date. */
  dueOn: string | null;
  /** The first owner (staff user id), or null. */
  ownerId: string | null;
  /** Every owner (task_assignees), for the Person filter on Team. Absent = just `ownerId`. */
  ownerIds?: string[];
  /** The area's slug in the areas table ("money" for Finance), live mode only. */
  areaSlug?: string | null;
  /** The status before a tick ('open' or 'in_progress'), so Undo puts back exactly what was there. Absent = 'open'. */
  status?: 'open' | 'in_progress';
  /** On the viewer's Mine tab (an owner, or given to all board members). */
  mine: boolean;
  /** The one quiet link on the row, or null. */
  link: { label: string; href: string } | null;
  /** Lines under "Schedule" on a share-the-schedule task (mock only), else null. */
  schedule: ScheduleLine[] | null;
  waiting: TasksWaiting | null;
  remind: TasksRemind | null;
  /** The steps, drawn as a list (mock), or null. */
  checklist: ChecklistStep[] | null;
  /** The checklist as one line ("Q4 budget · 2 of 4 done, now Approve"), when the steps are not read (live). */
  checklistLine: string | null;
  approval: ApprovalPlan | null;
  comments: TasksComment[];
  /** A last bit on the meta line ("1 started"), or null. */
  extra: string | null;
  /** False for a prompt that is not a stored task (the availability request): no check, no snooze, no detail writes. */
  stored: boolean;
};

/**
 * What the page may do. Mock mode: all true (it changes page state only, like the demo). Live mode: true only where a real
 * write exists; lib/tasks-map.ts names each condition.
 */
export type TasksCaps = {
  done: boolean;
  add: boolean;
  comment: boolean;
  snooze: boolean;
  /** Tick checklist steps in the detail. */
  checklist: boolean;
  /** Decline an approval with a typed reason. */
  declineReason: boolean;
  /** Approve or decline an approval on this page (never in live mode: it is decided on /finance/budget/approval). */
  approveInPlace: boolean;
  nudge: boolean;
  remind: boolean;
};

/** The whole page. */
export type TasksView = {
  today: string;
  /** "Tue, Nov 10" */
  dateLabel: string;
  /** The viewer's staff user id. */
  me: string;
  people: TasksPerson[];
  /** Area names in the order the filter lists them. */
  areas: string[];
  /** Each area's shown name to its slug in the areas table (live mode: a new task is written with the real slug). */
  areaSlugs?: Record<string, string>;
  tasks: TasksTask[];
  /** Titles finished in the last week. */
  done: string[];
  /** The clock shown on "Approved by you, 9:14 AM" (mock only). */
  clock: string;
  caps: TasksCaps;
};

/** What the loader returns: the view, or the whole page failed. `tasksFailed` = the list failed but the page draws. */
export type TasksResult = { failed: true } | (TasksView & { failed: false; tasksFailed: boolean });

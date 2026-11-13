// The Board members page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-people/index.html (the demo, source of truth for
// look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/people/people-board.tsx) and the loaders (mock/people-view.ts in
// mock mode, lib/people-live.ts in live mode, picked by lib/people-view-loader.ts). Types only, no logic. Dates travel as
// ISO strings or Eastern calendar days ("2026-11-10"). No email addresses travel here (the page shows none).
import type { StaffRole } from './role';

/** One board member's row. */
export type PeoplePerson = {
  /** The auth user id (live) or the sample's short id (mock). */
  id: string;
  name: string;
  initials: string;
  /** "Program lead", "President", "Board member", or null. */
  title: string | null;
  /** 'admin' = a board member with admin rights; 'board' = a board member. */
  role: StaffRole;
  /** Eastern calendar day of the last sign-in, or null when the person has not signed in yet (invited). */
  lastDay: string | null;
  /** True when the display name is an address (an invited account): drawn cut short with an ellipsis. */
  nameIsEmail: boolean;
};

/** The area words and icon a task row shows. */
export type PeopleAreaIcon = 'cap' | 'money' | 'flag' | 'mega';

/** One open task in a person's work. */
export type PeopleTask = {
  id: string;
  title: string;
  /** "Scholarships"; empty when the task has no area. */
  area: string;
  icon: PeopleAreaIcon | null;
  /** Eastern calendar day it is due, or null. */
  dueOn: string | null;
  /** A short extra line ("1 started"), or null. Mock sample only. */
  note: string | null;
  /** Mock sample only: the person this task of the viewer's waits on ("Waiting on Keith"). Live: always null. */
  waitsOn: string | null;
  /** Mock sample only: the drafted nudge for the person this task waits on. */
  ask?: string;
};

/** One booked interview in a person's work. Student names and codes are visible to all staff (decision D2). */
export type PeopleInterview = {
  /** The interview's slot id. */
  id: string;
  applicant: string;
  code: string;
  /** Eastern calendar day. */
  day: string;
  /** "5:30 PM" (Eastern). */
  time: string;
  /** The other interviewer's id, or null when the pair is not set. */
  mateId: string | null;
};

/** A person's open work: tasks assigned to them, tasks of the viewer's that wait on them, interviews ahead. */
export type PeopleWork = {
  /** The tasks the page lists, soonest due first. */
  tasks: PeopleTask[];
  /** Open tasks not listed ("119 more in Tasks"). The count beside "Open tasks" is tasks.length + more. */
  more: number;
  /** Mock sample only: the viewer's tasks that wait on this person. Live: always []. */
  waiting: PeopleTask[];
  interviews: PeopleInterview[];
};

/**
 * What each control may do. Mock mode: everything on (the page changes its own state, like the demo). Live mode: true only
 * where a real write exists behind the control; a false flag means the control is NOT drawn (no dead controls).
 */
export type PeopleCaps = {
  /** Give or remove admin rights (lib/people-actions.ts changeRoleAction; the server re-checks every rule). */
  changeRole: boolean;
  /** "Nudge <name>" and the gold "Send nudge": a direct message in Board chat (lib/chat-actions.ts openDirect + postMessage). */
  nudge: boolean;
  /** "Undo" after a nudge. Live: false (Board chat has no unsend). */
  nudgeUndo: boolean;
  /** "Message in Board chat" link. Live: false (Board chat has no link that opens one direct conversation). */
  message: boolean;
  /** True in mock mode only: writes change this tab's state and nothing is sent. */
  mock: boolean;
};

/** Everything the Board members page draws. */
export type PeopleView = {
  /** Eastern calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** "Tue, Nov 10". */
  dateLabel: string;
  /** The signed-in person's id. */
  me: string;
  /** The board members, in the order they joined. */
  people: PeoplePerson[];
  /** Each person's open work, by id. */
  work: Record<string, PeopleWork>;
  /** True when the open-work reads failed: the work cells say "Couldn't count", never "Nothing open". */
  workFailed: boolean;
  /** Eastern day the cycle's interviews start, or null (the drafted nudge says "interviews started today" on that day). */
  interviewsStart: string | null;
  /** True when the board members could not be read: the title and the "didn't load" card with Try again. */
  loadFailed: boolean;
  caps: PeopleCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type PeopleResult = (PeopleView & { failed: false }) | { failed: true };

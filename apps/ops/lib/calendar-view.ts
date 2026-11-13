// The Calendar page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-11).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-calendar/index.html (the demo, source of truth for
// look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/calendar/*) and the loaders (mock/calendar-view.ts in mock mode,
// lib/calendar-map.ts over lib/calendar.ts in live mode). Types only, no logic. Days travel as ISO dates ("2026-11-12",
// Eastern calendar days) and times as minutes after midnight Eastern, so server and browser always draw the same words.
import type { CalArea, CalPerson } from '@/components/calendar/types';

export type { CalArea, CalPerson };

/** What a thing on the calendar is; picks its icon, its eyebrow word and where the grid puts it. */
export type CalKind = 'span' | 'interview' | 'event' | 'task' | 'post' | 'cycle';

/** One thing on the calendar, whichever table it came from. */
export type CalViewItem = {
  id: string;
  kind: CalKind;
  area: CalArea;
  /** The day it falls on; a span starts here. */
  date: string;
  /** Spans only: the last day, inclusive. Null for everything else. */
  endDate: string | null;
  /** Minutes after midnight Eastern ("5:30 PM" = 1050), or null for all day, a due date or a post. */
  time: number | null;
  /** The row's title. For an interview: the student's full name (staff see names). */
  title: string;
  /** Interviews only: the application number ("APP-2026-00011"); null otherwise. */
  code: string | null;
  /** The short words on the month grid, without the time ("Q4 budget", "Applications, to Fri Nov 6"). */
  chip: string;
  /** People on it (ids from `people`). Empty means the whole board. */
  people: string[];
  /** Set when the thing waits on someone (draws "Waiting on Keith's caption" and, with caps.nudge, the nudge). */
  waiting: { /** id from `people` */ personId: string; /** "caption" */ what: string; /** The drafted nudge. */ draft: string } | null;
  /** Events only, when stored: the calendar_events kind ("meeting", "selection_meeting", "planning_call", "deadline", "event"). */
  eventKind?: string;
  /** True for a cycle step that already happened and is marked "Done" on its row. */
  done: boolean;
};

/** The one card that needs the viewer: a late step with one gold action. Mock mode only (no backend for the share yet). */
export type CalNeeds = {
  /** "Share the interview schedule with the board". */
  title: string;
  /** ISO due date; the page writes "1 day late" from `today`. */
  dueOn: string;
  /** The gold button ("Share with the board"). */
  action: string;
  /** The line once it went out ("Interview schedule sent to the board in board chat"); the page adds the time and Undo. */
  doneText: string;
};

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: true only where a
 * real write exists behind the control. A false flag means the control is NOT drawn (no dead controls).
 */
export type CalCaps = {
  /** "Add an event" in place (calendar_events insert). */
  add: boolean;
  /** "Undo" after an add (calendar_events delete of the row just added). */
  undoAdd: boolean;
  /** The "Needs you" card's gold action (share the schedule in board chat). No backend yet: mock only. */
  share: boolean;
  /** "Nudge <person>" on a thing that waits on someone. No backend yet: mock only. */
  nudge: boolean;
};

/** Everything the Calendar page draws. */
export type CalendarView = {
  /** Eastern calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** Eastern minutes after midnight when the data was built (a timed thing before this is past). */
  nowMin: number;
  /** "Tue, Nov 10". */
  dateLabel: string;
  /** The signed-in person's id (in `people`). */
  me: string;
  /** Board members, in the Person picker's order. */
  people: CalPerson[];
  items: CalViewItem[];
  /** True when the calendar's things could not be read: the panel shows the load error, the title still draws. */
  itemsFailed: boolean;
  /** The "Needs you" card, or null. */
  needs: CalNeeds | null;
  caps: CalCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card). */
export type CalendarResult = (CalendarView & { failed: false }) | { failed: true };

// The shapes the Calendar page works with. One CalItem is one thing on the calendar, whichever table it came from
// (calendar_events, interviews, tasks, posts or the cycle's dates); the loader does the merging so the page never knows.
export type CalArea = 'scholarships' | 'programs' | 'money' | 'outreach';
export type CalSource = 'event' | 'interview' | 'task' | 'post' | 'cycle';

export type CalPerson = { id: string; name: string };

export type CalItem = {
  id: string;
  /** The day it falls on ("2026-10-05", Eastern time). A span starts here. */
  date: string;
  /** Spans only (a bar across several days): the last day, inclusive. */
  endDate?: string;
  source: CalSource;
  area: CalArea;
  /** The short text on the month grid ("10:00 Interview"). */
  chip: string;
  /** The full title in the list and the side panel ("Interview APP-2026-00015"). */
  title: string;
  /** "10:00 AM", or null for an all-day item, a due date or a post. */
  start: string | null;
  /** People on it (staff profile ids). The signed-in person's id makes it "Yours". */
  people: string[];
  video?: boolean;
  /** A bar across days (the interview window, a late task) instead of a chip in one day. */
  span?: boolean;
  late?: boolean;
  /** The month grid's order inside a day when it differs from the list's order. */
  chipRank?: number;
  /** Phone list only (not drawn as a chip on the month grid). */
  hideInMonth?: boolean;
  /** Sorts to the top of its day in the list. */
  listFirst?: boolean;
};

export type CalendarData = {
  /** Today, "2026-10-04". */
  today: string;
  /** The signed-in person's id (a PEOPLE id). */
  me: string;
  people: CalPerson[];
  items: CalItem[];
  failed: boolean;
};

export const AREA_LABEL: Record<CalArea, string> = { scholarships: 'Scholarships', programs: 'Programs', money: 'Money', outreach: 'Outreach' };

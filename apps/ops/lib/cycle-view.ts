// The Cycle page's data contract (Ops Hub refresh, demo p-cycle). Types only, no logic: the line between the page
// (components/cycle/*) and its data. Mock mode fills it from mock/cycle-view.ts, live mode from the real tables in
// lib/cycle-live.ts (pure logic in lib/cycle-map.ts). Instants travel as ISO strings; calendar days as "2026-11-10"
// strings (never parsed as UTC instants). No student names or emails are carried here: counts only.
import type { MsMessage } from './mentorship-view';

/** The checklist's groups, one per schedule stage (Award holds both "Award announced" and "Funds sent"). */
export type CyGroupId = 'applications' | 'interviews' | 'scoring' | 'selection' | 'award';

/** Who owns a step: me (gold face), another board member (their initials), the BTX bot, or a group. */
export type CyOwner = { kind: 'me' | 'person' | 'bot' | 'group'; label: string; initials: string };

/** One step of the checklist (a task on one of the cycle's checklists, or a demo step in mock mode). */
export type CyRow = {
  id: string;
  group: CyGroupId;
  title: string;
  /** Null when nobody owns it. */
  owner: CyOwner | null;
  done: boolean;
  /** When it was done (an instant), or null. */
  doneAt: string | null;
  /** Due day ("2026-11-12"), or null. */
  due: string | null;
  /** A time on the due day ("7:00 PM"), or null. */
  time: string | null;
  /** The demo's two actions (mock only: both email or message people). */
  act: 'remind' | 'share' | null;
  /** A link to where the step is done (Open interviews, Open in Tasks, Review), or null. */
  link: { label: string; href: string } | null;
};

/** The published cycle: its words, dates and counts. A count is null when its read failed ("Couldn't count"). */
export type CyCycle = {
  title: string;
  award: string | null;
  amountCents: number | null;
  /** cycles.opens_at / closes_at (instants: open and closed are worked out from them, B14). */
  opensAt: string | null;
  closesAt: string | null;
  /** Calendar days. The three the table has no column for (scores due, selection, funds) are null live. */
  interviewStart: string | null;
  interviewEnd: string | null;
  scoresDue: string | null;
  selectionDay: string | null;
  selectionTime: string | null;
  decisionDate: string | null;
  fundsSent: string | null;
  /** The award was announced (cycles.decisions_released_at is set). */
  released: boolean;
  applied: number | null;
  booked: number | null;
  scored: number | null;
};

/** The Scholarships chat panel: loaded, or its own load error. */
export type CyChat =
  | { failed: false; title: string; people: number; messages: MsMessage[]; channelId: string | null; capped?: boolean }
  | { failed: true; title: string };

/** What the page may do. Mock mode: everything (the demo). Live: only where a real write exists (lib/cycle-live.ts). */
export type CyCaps = {
  /** "Remind the 16" (emails students): never live. */
  remind: boolean;
  /** "Share with the board": no backing write, never live. */
  share: boolean;
  /** Tick a step with Undo: not wired on this page (steps are done on /tasks), never live. */
  tick: boolean;
  /** "Nudge Charlie" on a late step: no direct-message writer on this page, never live. */
  nudge: boolean;
  /** The Scholarships chat composer (chat_messages insert). */
  send: boolean;
};

/** The loaded page. */
export type CycleView = {
  /** Today's Eastern calendar day. */
  today: string;
  /** The instant the page was read (open / closed is compared against it). */
  now: string;
  me: { userId: string; initials: string };
  /** The published cycle, or null (no published cycle: the empty state). */
  cycle: CyCycle | null;
  /** The cycle could not be read: the designed load error. */
  loadFailed: boolean;
  rows: CyRow[];
  /** The checklist could not be read: only that panel shows its error line. */
  listFailed: boolean;
  chat: CyChat;
  caps: CyCaps;
  /** Mock only (`?demo=failsend`): the first try of each chat send fails. */
  failFirst?: { send: boolean };
};

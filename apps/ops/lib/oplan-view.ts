// The Outreach Plan page's view contract (Ops Hub refresh 2026-11-12; demo p-outreach-plan): one shape that mock mode
// (mock/oplan-view.ts) and live mode (lib/oplan-live.ts) both return, and the client board (components/oplan/oplan-board.tsx)
// draws. Types only.

/** A board member who can own outreach work. `id` is the user id (mock: lower-case initials, "dm" is the viewer). */
export type PnPerson = { id: string; name: string; initials: string };

/** The two channels a plan item sits on. */
export type PnChannel = 'Instagram' | 'Newsletter';

/** One planned item: an Instagram post or a newsletter issue. */
export type PnItem = {
  id: string;
  ch: PnChannel;
  title: string;
  /** The calendar day it goes out ("2026-11-21"), or null when no date is set yet. */
  date: string | null;
  /** The owner's person id, or null when nobody owns it. */
  owner: string | null;
  /** Posted (or sent, for an issue). */
  posted: boolean;
  /** "Posted" or "Sent" beside the check. */
  postedWord: 'Posted' | 'Sent';
  /** A post's steps done, 0 to 5 (caption, photo, approval, schedule, posted). */
  steps: number;
  /** A newsletter issue's sections (done of all), or null when it has none. */
  sections: { done: number; of: number } | null;
  /** Mock only: the person whose caption the post waits on (the "Needs you" nudge). */
  waitOn: string | null;
  /** Mock only: the short name the nudge message uses ("interview-week"). */
  slug: string | null;
  /** A short note under the title ("Starts once the winner is announced"). */
  note: string | null;
};

/** One channel row: Instagram draws this month's posts as squares; the others a short line. */
export type PnChan = {
  id: string;
  kind: 'instagram' | 'newsletter' | 'other';
  name: string;
  /** Instagram: posts a month (null when the target has no number). */
  target: number | null;
  /** Newsletter and others: the bold line ("Monthly email"). */
  k: string;
  /** Newsletter and others: the muted line ("Issue goes out once a month"). */
  line: string;
  owner: string | null;
};

/**
 * Which controls are drawn. Mock mode: all of them (the page changes its own state, like the demo). Live mode: only
 * where a real write exists (addPost); `parse` reads the date and owner for that write.
 */
export type PnCaps = {
  /** "Plan a post or issue": adds an Instagram post (live: a posts row). */
  addPost: boolean;
  /** Read a day and a name from the typed line (date and owner chips). */
  parse: boolean;
  /** The channel chip can switch to Newsletter (mock only: no issue writer). */
  addIssue: boolean;
  /** "Nudge Keith" in the Needs card (mock only). */
  nudge: boolean;
  /** "No owner yet" with the board's names to pick (mock only). */
  pickOwner: boolean;
  /** Undo after picking an owner (mock only). */
  undo: boolean;
  /** The N key opens the add field (mock only). */
  nKey: boolean;
};

/** What the page draws. */
export type PnView = {
  /** The Eastern calendar day the page counts from ("2026-11-10"). */
  today: string;
  /** The viewer's person id. */
  me: string;
  people: PnPerson[];
  items: PnItem[];
  channels: PnChan[];
  /** The Instagram channel's id (where a new post goes); null when there is none ("Not connected yet."). */
  instagramId: string | null;
  /** The header and the "Outreach plan didn't load." card, nothing else. */
  loadFailed: boolean;
  caps: PnCaps;
};

/** The loader's answer: the view, or the whole page failed. */
export type PnResult = (PnView & { failed: false }) | { failed: true };

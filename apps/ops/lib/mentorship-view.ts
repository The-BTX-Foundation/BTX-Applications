// The Mentorship page's data contract (Ops Hub refresh, demo p-mentorship). Types only, no logic: the line between the
// page (components/mentorship/*) and its data. Mock mode fills it from mock/mentorship-view.ts, live mode from the real
// tables in lib/mentorship-live.ts (pure mapping in lib/mentorship-map.ts). Dates travel as ISO strings.
// No mentor or mentee personal data exists in the schema, and none is added here: a step is a task on the program's
// setup checklist, and the chat is the Programs area channel.

/** A task status that is not done (tasks.status allows open, in_progress, done, declined). */
export type OpenStatus = 'open' | 'in_progress' | 'declined';

/** Any tasks.status value the page writes. */
export type TaskStatus = 'done' | OpenStatus;

/** One step of "Where it stands" (a task on the mentorship program's setup checklist). */
export type MsStep = {
  id: string;
  title: string;
  done: boolean;
  /** The status a reopen writes (the step's own status when it loaded open, declined included; 'open' when it loaded done). */
  reopenAs: OpenStatus;
  /** Open and nobody owns it (no person and no group): "No owner" under the title. */
  unassigned: boolean;
  /** Due date ("2026-12-31"), or null. */
  due: string | null;
  /** The short line under the title (tasks.note, e.g. "No launch date yet"), or null. */
  sub: string | null;
  /** The step whose one action is "Share the application" (mock only: there is no mentor application table). */
  share: boolean;
  /** A budget approval on the checklist: never ticked here (decided only on /finance/budget/approval). */
  approval: boolean;
};

/** One chat message as the panel draws it. */
export type MsMessage = {
  id: string;
  /** "Today", "Yesterday" or "Wed Nov 4" (Eastern). */
  day: string;
  who: string;
  initials: string;
  bot: boolean;
  mine: boolean;
  /** "4:30 PM" (Eastern). */
  time: string;
  text: string;
};

/** The Programs chat panel: loaded, or its own load error (the rest of the page still shows). */
export type MsChat =
  | {
      failed: false;
      title: string;
      people: number;
      messages: MsMessage[];
      /** The Programs area channel's id (live), or a fixed key in mock mode; null when the channel does not exist. */
      channelId: string | null;
    }
  | { failed: true; title: string };

/**
 * What the page may do. Mock mode turns everything on (the demo). Live mode: each flag is true only where a real write
 * exists (conditions in lib/mentorship-live.ts).
 */
export type MsCaps = {
  /** Tick / untick a step (tasks.status update; approvals refused by the writer). */
  tick: boolean;
  /** "Done 9:14 AM · Undo" after a tick: Undo writes the reverse status. */
  undo: boolean;
  /** "Share the application" on the recruiting step: no table or function exists, so mock only. */
  share: boolean;
  /** The chat composer (chat_messages insert into the Programs channel). */
  send: boolean;
};

/** The loaded page. */
export type MentorshipView = {
  failed: false;
  /** Today's Eastern calendar day ("2026-11-10"); every date word is counted from it. */
  today: string;
  /** The signed-in person: their id keys the chat's drafts and Not-sent rows; initials draw their messages. */
  me: { userId: string; initials: string };
  /** The word beside the title ("Not active yet", "Active" ...). */
  status: string;
  /** The loaded checklist's id: every step write is scoped to it (null when there is no checklist). */
  checklistId: string | null;
  /** The checklist could not be read: the page draws its designed load error (the chat panel is not drawn). */
  loadFailed: boolean;
  steps: MsStep[];
  chat: MsChat;
  caps: MsCaps;
  /** Mock only (`?demo=failsave` / `?demo=failsend`): the first try of each write fails, to show the failure states. */
  failFirst?: { save: boolean; send: boolean };
};

/** What the loader returns: the page, or the whole-page "didn't load" card (mock `?demo=failed`). */
export type MentorshipResult = MentorshipView | { failed: true };

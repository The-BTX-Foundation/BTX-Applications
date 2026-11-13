// The Awardees page's data contract (Ops Hub refresh, demo p-awardees). Types only, no logic: the line between the page
// (components/awardees/*) and its data. Mock mode fills it from mock/awardees-view.ts, live mode from the real tables in
// lib/awardees-live.ts (pure mapping in lib/awardees-map.ts). Dates travel as ISO strings.
// Student names, codes and emails are shown to every staff member (owner decision D2). They are read only under
// row-level security as the signed-in person and never go into a URL, a log or an error text.

/** One of the five awardee steps, by position: 0 letter, 1 acceptance, 2 payment details, 3 funds, 4 thank-you. */
export type AwStepIndex = 0 | 1 | 2 | 3 | 4;

/** One awardee of the current term (a main or extra award with its five steps). */
export type AwAward = {
  /** scholarship_awards.id */
  id: string;
  /** The applicant code ("APP-2026-00003"), or "—" when the application could not be matched. */
  code: string;
  /** The awardee's full name (the code when the name is blank). */
  name: string;
  /** The awardee's email for "Call or email" ("" when there is none). */
  email: string;
  /** The short award name ("Legacy", "Empowerment"). */
  award: string;
  /** The amount in cents, or null when it is not set yet. */
  amountCents: number | null;
  kind: 'main' | 'extra';
  /** An extra award's decision note ("Opened at the selection meeting"), or null. */
  note: string | null;
  /** When each of the five steps was done (ISO instant), or null. Always five entries. */
  done: (string | null)[];
  /** When the last acceptance reminder was recorded (ISO instant), or null. */
  reminder: string | null;
  /** The funds step's due day ("2026-12-14"), or null. */
  fundsDue: string | null;
  /** A board comment on the award (mock only: there is no comment column, so live is always null). */
  comment: { by: string; initials: string; text: string } | null;
};

/** One award entered by hand for history (initials only, as entered). */
export type AwPast = {
  id: string;
  term: string;
  award: string;
  amountCents: number | null;
  /** The label as entered ("G.A."). */
  label: string;
  /** The term's main award (drawn with the gold-ink icon and the full bar segment). */
  main: boolean;
};

/** The published cycle as the page shows it before awards exist. */
export type AwCycle = {
  /** "Fall 2026". */
  term: string;
  /** The main award's short name and amount ("Legacy", 250000), for "Legacy · $2,500". */
  mainAward: string | null;
  mainCents: number | null;
  /** The selection meeting as words ("Tue Nov 24, 7:00 PM"), or null when no meeting is on the calendar. */
  meeting: string | null;
  /** The day students hear (cycles.decision_date, "2026-11-30"), or null when not set. */
  decisionDay: string | null;
  /** When decisions were released (an ISO instant), or null. */
  releasedAt: string | null;
};

/**
 * What the page may do. Mock mode turns on every demo behaviour. Live mode: each flag is true only where a real write
 * exists (conditions in lib/awardees-live.ts).
 */
export type AwCaps = {
  /** Tick or untick steps 1, 2, 3 and 5 (lib/actions/awardees.ts setStepDone). */
  tick: boolean;
  /** "Saved 9:02 AM · Undo" after a tick or untick: mock only (live re-ticks or unticks with the step control). */
  undo: boolean;
  /** Mark funds sent (rpc mark_award_funds_sent: ticks step 4 and logs the payment on Budget; never undone here). */
  funds: boolean;
  /** "Send another reminder" that emails the student: no email is ever sent from here, so mock only. */
  remindEmail: boolean;
  /** "Record a reminder": stores the date a reminder went out (award_steps.reminder_sent_at); emails nothing. */
  recordReminder: boolean;
};

/** The loaded page. */
export type AwardeesView = {
  failed: false;
  /** Today's Eastern calendar day ("2026-12-03"); every date word is counted from it. */
  today: string;
  /** The published cycle, or null when there is none. */
  cycle: AwCycle | null;
  /** The current term's awards (main first, then extras, in the order they were decided). */
  awards: AwAward[];
  /** Past awards entered for history, newest term first. */
  past: AwPast[];
  /** The past awards could not be read: only that section shows its load error. */
  pastFailed: boolean;
  /** A core read failed: the page draws its designed load error under the title. */
  loadFailed: boolean;
  caps: AwCaps;
  /** Mock only (`?demo=failsave`): the first try of each write fails, to show the failure state. */
  failFirst?: boolean;
};

/** What the loader returns: the page, or the whole-page "didn't load" card (mock `?demo=failed`). */
export type AwardeesResult = AwardeesView | { failed: true };

// The Selection page's data in one shape (Ops Hub refresh, demo p-selection). The loader (lib/selection-view-loader.ts)
// fills it from the mock sample (mock/selection-view.ts) or the live tables (lib/selection-live.ts), and the client board
// (components/selection/selection-board.tsx) draws it. Types only.
//
// The ranking only ever holds applications whose two interview scores are both published (the database view
// application_score_summary counts published scores only, and the score rows are read with published = true). Nothing
// about an unpublished score is in this shape: an application without both published scores is "not scored yet".

/** One rubric question: its key in scores.criteria, the short label the table shows, and its weight in percent. */
export type SlCrit = { key: string; short: string; weight: number };

/** An interviewer as the ranking names them. */
export type SlPerson = { name: string; first: string };

/** A quote from the interview summary. */
export type SlQuote = { criterion: string; at: string; text: string };

/** A ranked applicant (both scores published). */
export type SlRow = {
  applicationId: string;
  code: string;
  name: string;
  /** A board member's Portal test application (labelled "Board test"). */
  test: boolean;
  /** The combined score (the average of the published weighted scores). */
  combined: number;
  /** The two interviewers whose published scores are shown. */
  pair: [SlPerson, SlPerson];
  /** Each interviewer's weighted score (1 to 5). */
  parts: [number, number];
  /** Each interviewer's pick per question, in the order of `crit` (null when the question has no pick). */
  picks: [(number | null)[], (number | null)[]];
  summary: string | null;
  quotes: SlQuote[];
};

/** A submitted applicant without both scores published (can still be chosen; the board decides). */
export type SlUnscored = { applicationId: string; code: string; name: string; test: boolean; why: string };

/** An award recorded for this cycle. */
export type SlAward = {
  id: string;
  applicationId: string;
  code: string;
  name: string;
  kind: 'main' | 'extra';
  /** The name shown: "Legacy" for the main award, the board's own name for an extra one. */
  awardName: string;
  amountCents: number;
  /** When it was recorded (timestamptz), or null. */
  decidedAt: string | null;
  /** Step 1 (award letter sent) is done: the award can no longer be undone here. */
  letterDone: boolean;
};

/** The cycle the page is about. Day fields are YYYY-MM-DD strings (never parsed as UTC). */
export type SlCycle = {
  id: string | null;
  term: string;
  /** The short main award name ("Legacy"). */
  mainName: string;
  /** The name saved on the award row when the main award is recorded (cycles.award_name). */
  mainAwardName: string;
  mainCents: number;
  /** Every submitted applicant (everyone gets a decision). */
  total: number;
  interviewStart: string | null;
  interviewEnd: string | null;
  /** When scores are due: an instant, or null (live has no such column yet). */
  scoresDue: string | null;
  /** The day the award is announced (cycles.decision_date), or null. */
  decisionDate: string | null;
  /** When decisions were released (timestamptz), or null. */
  releasedAt: string | null;
};

/** The selection meeting (a calendar_events row of kind selection_meeting). */
export type SlMeeting = { startsAt: string; videoUrl: string | null };

/** What this person may do here. Release is admins only; the server actions check again. */
export type SlCaps = {
  /** Record the main award and extra awards. */
  record: boolean;
  /** Undo a recorded award (until its letter goes out or decisions are released). */
  undo: boolean;
  /** Release decisions to applicants (admins only). */
  release: boolean;
};

/** The page. */
export type SelectionView = {
  failed: false;
  /** A core read failed: the page draws its designed load error. */
  loadFailed: boolean;
  /** The page's "now" (an instant): the server clock live, the demo's moment in mock mode. */
  now: string;
  /** Today's Eastern day (YYYY-MM-DD). */
  today: string;
  cycle: SlCycle | null;
  meeting: SlMeeting | null;
  crit: SlCrit[];
  rows: SlRow[];
  unscored: SlUnscored[];
  awards: SlAward[];
  caps: SlCaps;
  /** Mock ?demo=failsave: the first try of each write fails (never set live). */
  failFirst: boolean;
};

/** The page, or the whole-page "didn't load" card (mock ?demo=failed only). */
export type SelectionResult = SelectionView | { failed: true };

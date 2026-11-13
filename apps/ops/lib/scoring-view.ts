// The Scoring page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12): the signed-in interviewer's
// queue, the rubric, their own picks, the interview notes and their private notes.
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-scoring/index.html (the demo, source of truth for look
// and behaviour).
//
// This file is the contract between the page (components/scoring/*) and the loaders (mock/scoring-view.ts in mock mode,
// lib/scoring-live.ts in live mode, picked by lib/scoring-view-loader.ts). Types only, no logic. Instants travel as ISO
// strings; calendar days as "2026-11-19".
//
// SENSITIVE (blind scoring, database-enforced): a sheet carries ONLY the signed-in person's own picks (drafts included) and,
// for the other interviewer, whether they published (from score_progress(), no values). Another interviewer's score is never
// in this shape. Private notes are the signed-in person's own. The cycle average per criterion is computed on the server
// from scores the person may see (their own and released ones) and only the average travels.

/** One rubric criterion, in rubric order. */
export type ScCriterion = {
  /** The rubric key ("community"), as stored in scores.criteria. */
  key: string;
  /** "Community engagement and values". */
  name: string;
  /** "Community" (the phone review list and the quotes' caption). */
  short: string;
  /** Points out of 100 ("20 points"). */
  weight: number;
  /** "3.8": the cycle average over the scores the person may see, or null when there is none (or it could not be read). */
  avg: string | null;
  /** The interview questions for this criterion, in order ([] when none). */
  questions: string[];
};

/** A moment from the interview, quoted under its criterion. */
export type ScQuote = {
  /** The criterion key the quote belongs to, or null when it names none of them. */
  key: string | null;
  /** The caption's label ("Community"). */
  label: string;
  /** Where in the recording ("8:12"). */
  at: string;
  text: string;
};

/** The interviewers' notes on one interview question (or the overall notes), read only (table interview_notes). */
export type ScIvNote = {
  /** "3. Tell us about a time ..." or "Overall notes". */
  label: string;
  /** Each author's words; "You" for the signed-in person. */
  notes: { name: string; body: string }[];
};

/** One application in the signed-in person's queue: their own score sheet. */
export type ScSheet = {
  applicationId: string;
  /** "APP-2026-00011". */
  code: string;
  /** The applicant's full name (D2: visible to all staff). */
  name: string;
  /** A board member's Portal test application. */
  test: boolean;
  /** The interview's Eastern calendar day ("2026-11-12"), or null when unknown. */
  interviewDay: string | null;
  /** How long the interview ran, in minutes, or null when no summary says. */
  minutes: number | null;
  /** The other interviewer's name ("Charlie Gaines"). */
  otherName: string;
  /** Whether the other interviewer published (score_progress(): a yes or no, never a value). */
  otherPublished: boolean;
  /** The signed-in person's own picks: criterion key -> 1..5. */
  picks: Record<string, number>;
  /** Their own score is published (locked: there is no un-publish, D8). */
  published: boolean;
  /** When they published (instant), or null. */
  publishedAt: string | null;
  /** When their draft was last saved (instant), or null when nothing is saved yet. */
  savedAt: string | null;
  /** The shared interview summary, or null. */
  summary: string | null;
  quotes: ScQuote[];
  /** Their own private note ('' when none). */
  note: string;
  /** The interviewers' notes per question from the interview's page, in question order ([] or absent when none). */
  ivNotes?: ScIvNote[];
};

/** What each control may do. Mock mode: everything the demo shows. Live mode: see lib/scoring-map.ts LIVE_CAPS. */
export type ScCaps = {
  /** "Publish undone" after a publish. Never live: there is no un-publish (D8). */
  undoPublish: boolean;
  /** "Nudge <other interviewer>" in Board chat. Never live: no score-adjacent message is sent from this page. */
  nudge: boolean;
};

/** Mock-only switches that make otherwise unseeable states visible (`?demo=failsave`, `?demo=slowpublish`). Always null live. */
export type ScSim = { failSave: boolean; slowPublish: boolean };

/** What the page draws. */
export type ScoringView = {
  /** The Eastern calendar day the page is drawn for ("2026-11-19"). */
  today: string;
  /** The server's instant when the page was read. */
  now: string;
  /** The scores' due day, or null (live mode has no such setting yet). */
  due: string | null;
  criteria: ScCriterion[];
  sheets: ScSheet[];
  caps: ScCaps;
  /** The interview summaries could not be read: the notes say so instead of "not written yet". */
  notesFailed: boolean;
  /** The interview questions could not be read: each criterion says so instead of offering "Questions". */
  questionsFailed: boolean;
  /** The per-question interview notes could not be read: the notes panel says so instead of showing none. */
  ivNotesFailed?: boolean;
  sim: ScSim | null;
};

/** The loader's answer: the view, or a failed core read (the page's "didn't load" card, never an empty queue). */
export type ScoringResult = ({ failed: false } & ScoringView) | { failed: true; page?: boolean };

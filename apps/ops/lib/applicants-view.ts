// The Applicants pages' data in the shape the refreshed pages draw (Ops Hub refresh, 2026-11-12): the list
// (/scholarships/applicants) and the full application (/scholarships/applicants/[code]).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-applicants/index.html (the demo, source of truth for
// look and behaviour; its `#/APP-...` view is the design for the detail route).
//
// This file is the contract between the pages (components/applicants/*) and the loaders (mock/applicants-view.ts in mock
// mode, lib/applicants-live.ts in live mode, picked by lib/applicants-view-loader.ts). Types only, no logic. Instants travel
// as ISO strings; calendar days as "2026-11-20".
//
// Sensitive: student names, Terpmail, phone (visible to all staff, D2). Nothing here goes into a URL except the applicant
// code (which is not a name). Scores: only what row-level security lets the signed-in person read (own draft count, and the
// average once BOTH interviewers have published).

/** A board member who interviews (or the viewer, `me`). */
export type ApPerson = { id: string; name: string; first: string; initials: string; me: boolean };

/** Where an application is, derived from the data (never stored): lib/applicants-map.ts stageOf. */
export type ApStageKind = 'unbooked' | 'interview' | 'needs' | 'waiting' | 'scored';

/** One submitted application, as the list, the preview and the detail draw it. */
export type ApApplicant = {
  id: string;
  /** "APP-2026-00011" (unique; the only applicant fact that goes into a URL). */
  code: string;
  /** Full name (the code when the name is blank). */
  name: string;
  /** A board member's Portal test (not a Terpmail address): the "Board test" tag. */
  test: boolean;
  /** When the application was submitted (instant). */
  appliedAt: string;
  /** The active booking's start (instant), or null = not booked. */
  interviewAt: string | null;
  /** The booked slot's length in minutes, or null when unknown. */
  interviewMinutes: number | null;
  /** The booked interview time's id (opens /scholarships/interviews/[slot]), or null = not booked / no page in the sample. */
  slotId?: string | null;
  /** The two interviewers ([] when nobody is paired). */
  pair: ApPerson[];
  /** Ids of the interviewers who published their score (progress only, no values). */
  published: string[];
  /** The viewer's own unpublished draft: criteria filled in (0 = not started). */
  draft: number;
  /** The average of both published scores, only once both are published (else null). */
  avg: number | null;
  /** The shared interview summary, or null. */
  summary: string | null;
  /** Terpmail and phone for the admin-only export; null when the viewer may not export (never sent to the browser then). */
  email: string | null;
  phone: string | null;
};

/** What each control may do. Mock mode: all true. Live mode: see lib/applicants-map.ts liveCaps. */
export type ApCaps = {
  /** "Nudge <interviewer>" / "Remind <student>" drafts and the detail's nudge news card. No live path (mock only). */
  nudge: boolean;
  /** "Export" of the rows on screen as a CSV (admins only, O1). */
  export: boolean;
};

/** The cycle-wide facts both pages draw. */
export type ApCycle = {
  /** "Fall 2026" ('' when there is no published cycle). */
  term: string;
  /** "Legacy Scholarship". */
  awardName: string;
  /** When applications open (instant), or null: the empty list's second line. */
  opensAt: string | null;
  /** Criteria in the rubric (the draft squares). */
  criteriaTotal: number;
  /** The day scores are due, or null (live: not stored, so not drawn). */
  scoresDue: string | null;
  /** The last interview day (cycles.interview_end), or null. */
  interviewEnd: string | null;
  /** The selection meeting's start (calendar), or null. */
  selectionAt: string | null;
  /** The award (decision) day, or null. */
  awardOn: string | null;
};

/** Everything the list page draws. */
export type ApplicantsView = {
  /** The instant the data was built for (stage words are counted from it). */
  now: string;
  /** The viewer's id (null in a failed read). */
  me: string | null;
  cycle: ApCycle;
  /** Board members for the Interviewer picker (everyone who interviews, the viewer first as "You"). */
  people: ApPerson[];
  applicants: ApApplicant[];
  /** True when the list could not be read (mock `?demo=error`: the list card's error line). */
  loadFailed: boolean;
  caps: ApCaps;
};

/** One labelled answer; value null = "Not answered". */
export type ApFact = { label: string; value: string | null };

/** Everything the full application draws. */
export type ApplicantDetailView = {
  now: string;
  me: string | null;
  cycle: ApCycle;
  applicant: ApApplicant;
  /** Name, Terpmail, other email, phone, gender, race (exactly what the detail page showed before the refresh). */
  identity: ApFact[];
  /** The Portal's answers, in the order it asks them. */
  answers: ApFact[];
  /** The three short answers ('' = not answered), in the order of SHORT_ANSWER_QUESTIONS. */
  shortAnswers: [string, string, string];
  files: { kind: 'resume' | 'transcript'; label: string; filename: string | null }[];
  caps: ApCaps;
};

/** What the list loader returns: the view, or a whole-page failure (the shared LoadError card). */
export type ApplicantsResult = (ApplicantsView & { failed: false }) | { failed: true };

/** What the detail loader returns: the view, not found (404), or a whole-page failure. */
export type ApplicantDetailResult = (ApplicantDetailView & { failed: false; missing: false }) | { failed: true; missing: false } | { failed: false; missing: true };

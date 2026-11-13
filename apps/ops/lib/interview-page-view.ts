// The page for one interview (route /scholarships/interviews/[slot], built 2026-11-13 from board feedback: one page per
// interview, the Teams link easy to reach, a notes box per question). Types only, no logic: the line between the page
// (components/interview-page/*) and its data. Mock mode fills it from mock/interview-page.ts; live mode from the real tables
// (lib/interview-page-live.ts, mapped by the pure functions in lib/interview-page-map.ts). Instants travel as ISO strings.
//
// SENSITIVE: other people's notes and the Teams link reach the browser only when the viewer is one of the interview's two
// interviewers or an admin (`canRead`); everyone else gets `link: null` (with `linkHidden` when one is set) and no notes.

/** The key of the "Overall notes" box (a question's box is keyed by the question id). */
export const OVERALL = 'overall';

/** One of the two interviewers. */
export type IpPerson = { id: string; name: string; initials: string; me: boolean };

/** Someone else's note on one question (or overall), read only. */
export type IpNote = { authorId: string; name: string; body: string };

/** One interview question, numbered 1, 2, 3 down the page. */
export type IpQuestion = { id: string; n: number; text: string };

/** The questions under one scoring area ("To close" for the unscored ones). */
export type IpGroup = { key: string; name: string; questions: IpQuestion[] };

/** What the page may offer. Live: each flag names its condition in lib/interview-page-map.ts. */
export type IpCaps = {
  /** "Change" on an interviewer (admins only; changeInterviewerAction). */
  change: boolean;
  /** The viewer's own notes boxes (one of the two interviewers, or an admin; saveInterviewNoteAction). */
  notes: boolean;
  /** "Score <name>" (the viewer is one of the two interviewers). */
  score: boolean;
};

/** Mock only: who could cover each interviewer (by their id), and a switch that makes every note save fail. */
export type IpSim = { replacements: Record<string, IpPerson[]>; failSave: boolean };

/** Everything the page draws. */
export type InterviewPageView = {
  source: 'mock' | 'live';
  /** The interview time's id (the page's id). */
  slotId: string;
  /** The interview's start and end (instants), or null when the time could not be read. */
  startsAt: string | null;
  endsAt: string | null;
  /** The student's full name (the code when blank) and applicant code. */
  name: string;
  code: string;
  /** "Fall 2026 Legacy Scholarship", or null when the cycle names none. */
  award: string | null;
  /** The two interviewers; [] when nobody is paired yet. */
  pair: IpPerson[];
  /** The signed-in person's id. */
  me: string | null;
  isAdmin: boolean;
  /** The viewer is one of the two interviewers or an admin: sees the link and everyone's notes. */
  canRead: boolean;
  /** The Teams link (only when `canRead`). */
  link: string | null;
  /** A link is set that this viewer may not see. */
  linkHidden: boolean;
  /** The cycle's interview questions in the Questions page's order; [] when there are none. */
  groups: IpGroup[];
  /** The questions read failed (only that part says so). */
  questionsFailed: boolean;
  /** The viewer's own notes, by question id or OVERALL. */
  mine: Record<string, string>;
  /** Other people's notes, by question id or OVERALL (only when `canRead`). */
  others: Record<string, IpNote[]>;
  /** The notes read failed: the boxes are not drawn (never empty boxes over saved words). */
  notesFailed: boolean;
  caps: IpCaps;
  /** Mock only; null live. */
  sim: IpSim | null;
};

/** The loader's answer: the view, no such interview (a 404), or a failed core read (the "didn't load" card). */
export type InterviewPageResult = { state: 'ok'; view: InterviewPageView } | { state: 'missing' } | { state: 'failed' };

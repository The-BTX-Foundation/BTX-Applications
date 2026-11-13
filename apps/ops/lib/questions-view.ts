// The Interview questions page's data contract (Ops Hub refresh, demo p-questions). Types only, no logic: the line between
// the page (components/questions/*) and its data. Mock mode fills it from mock/questions-view.ts; live mode from the real
// tables (lib/questions-live.ts, mapped by the pure functions in lib/questions-map.ts). Dates travel as ISO strings.

/** One question as the page draws it. */
export type QnQuestion = { id: string; text: string };

/** One scoring criterion (or "To close", key null, not scored) with its questions in order. */
export type QnGroup = { key: string | null; name: string; /** Points; null for "To close". */ weight: number | null; questions: QnQuestion[] };

/** The signed-in person's next booked interview (the ticket). Student name and code: staff read them (D2). */
export type QnNext = { startsAt: string; endsAt: string; code: string; applicant: string; withName: string };

/**
 * What the page may do. Live mode: a flag is true only where a real write exists behind it (lib/questions-map.ts
 * `liveCaps` names each condition); mock mode turns on everything the demo draws.
 */
export type QnCaps = {
  /** Change a question's text in place (saveInterviewQuestion with an id). */
  edit: boolean;
  /** Add a question at the end of a group (saveInterviewQuestion without an id). */
  add: boolean;
  /** Remove a question (removeInterviewQuestion, permanent). */
  remove: boolean;
  /** Move a question one place up or down (moveInterviewQuestion). */
  move: boolean;
  /** Drag a question to a new place: the same one-place moves, one after another. */
  drag: boolean;
  /** "Use the starter questions" (addStarterQuestions, the seed rpc). */
  starter: boolean;
  /** Undo of an edit: saves the previous words back. */
  editUndo: boolean;
  /** Undo of an add: removes the question just added. */
  addUndo: boolean;
  /** Undo of a move: the reverse moves. */
  moveUndo: boolean;
  /** Undo of a removal (mock only: there is no write that brings a removed question back). */
  removeUndo: boolean;
  /** Undo of the starter questions (mock only: no single reverse write). */
  starterUndo: boolean;
  /** The "Draft" chip beside the heading (mock only: no column holds a draft state). */
  draftChip: boolean;
};

/** Mock-only write outcomes for states a live page cannot be pushed into on purpose (`?demo=failsave|conflict|timeout`). */
export type QnMockWrite = 'failsave' | 'conflict' | 'timeout' | null;

/** Everything the page draws. */
export type QnView = {
  /** The published cycle's id; null when no cycle is published (nothing can be added). */
  cycleId: string | null;
  /** "Fall 2026", beside the title. */
  term: string | null;
  groups: QnGroup[];
  /** Admin rights (edit controls). Live: the role from the auth server. */
  isAdmin: boolean;
  next: QnNext | null;
  /** The next-interview read failed (an optional read): only that panel shows its load error. */
  nextFailed: boolean;
  /** The questions read failed (core): the page shows its "didn't load" card. */
  loadFailed: boolean;
  caps: QnCaps;
  /** The signed-in person's user id (keys the "Not saved" store). */
  me: string | null;
  /** How many questions "Use the starter questions" adds. */
  starterCount: number;
  mockWrite: QnMockWrite;
};

/** The loader's answer: the view, or the whole page failed. */
export type QnResult = (QnView & { failed: false }) | { failed: true };

// The Interview questions page's write decisions, kept pure so they are unit-tested (tests/questions-flow.test.ts): the
// local changes each action makes (add, edit, remove, move), the one-place moves a drag stands for, the edit guard (one
// board member's edit never silently overwrites another's newer one), which failed saves a refresh shows went through,
// what each result says, and when focus may move. The board (components/questions/questions-board.tsx) applies them.
import { gkOf } from './questions-map';
import type { QnGroup } from './questions-view';

/** The fixed error line after a refused or failed write. */
export const ERR_SAVE = "Couldn't save. Try again.";
/** After a write that may have gone through before its answer was lost (a timeout). */
export const ERR_TIMEOUT = 'No answer in time. Reload to check.';
/** The edit guard refused: someone else changed the question since this page loaded it. */
export const ERR_CONFLICT = 'Someone else changed this question, so your words were not saved.';
/** The question is no longer there (someone removed it). */
export const ERR_GONE = 'That question is gone.';
/** A queued add or edit that an earlier failed write stopped before it was sent (its words are kept). */
export const ERR_SKIPPED = "Not saved, because an earlier change didn't save. Try again.";
/** A queued removal, move or undo that an earlier failed write stopped before it was sent. */
export const ERR_NOT_DONE = "Not done, because an earlier change didn't save.";
/** Said once when an earlier failure stopped the changes queued after it. */
export const SAY_SKIPPED = 'Later changes were not saved.';
/** Undo of an add refused: the question no longer has the words that were added. */
export const ERR_UNDO_CHANGED = 'This question changed. Remove it from the list if you still want it gone.';
/** A failed save kept from a cycle that is no longer the current one. */
export const ERR_OLD_CYCLE = 'This was for the earlier cycle.';
/** A paste that went past the limit. */
export const CUT_WORDS = 'Cut to 500 characters.';
/** The most a question may hold (the action's own limit). */
export const MAX_CHARS = 500;

/** One write's result as the page sees it. */
export type WriteOutcome = { ok: true; id?: string; /** The starter questions: how many the re-read found added. */ added?: number } | { ok: false; kind: 'failed' | 'timeout' | 'conflict' | 'gone'; message: string };

/** The words a failed outcome shows (the action's own plain message where it gave one, e.g. "Keep the question under 500 characters."). */
export function failWords(o: Exclude<WriteOutcome, { ok: true }>): string {
  if (o.kind === 'timeout') return ERR_TIMEOUT;
  if (o.kind === 'conflict') return ERR_CONFLICT;
  if (o.kind === 'gone') return ERR_GONE;
  return o.message || ERR_SAVE;
}

/**
 * Text as it is saved: zero-width characters (U+200B to U+200D, U+FEFF) dropped, newlines and runs of spaces become one
 * space, trimmed (the demo's rule).
 */
export const clean = (t: string): string => t.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();

// ---------- Local changes (optimistic, and the mock store) ----------

/** Finds a question: its group, its place and the question. */
export function findQ(groups: QnGroup[], id: string): { g: QnGroup; i: number } | null {
  for (const g of groups) {
    const i = g.questions.findIndex((q) => q.id === id);
    if (i >= 0) return { g, i };
  }
  return null;
}

/** The groups with one question's text changed. */
export function applyEdit(groups: QnGroup[], id: string, text: string): QnGroup[] {
  return groups.map((g) => (g.questions.some((q) => q.id === id) ? { ...g, questions: g.questions.map((q) => (q.id === id ? { ...q, text } : q)) } : g));
}

/** The groups with a question added at the end of group `gk`. */
export function applyAdd(groups: QnGroup[], gk: string, id: string, text: string): QnGroup[] {
  return groups.map((g) => (gkOf(g.key) === gk ? { ...g, questions: [...g.questions, { id, text }] } : g));
}

/** The groups without one question. */
export function applyRemove(groups: QnGroup[], id: string): QnGroup[] {
  return groups.map((g) => (g.questions.some((q) => q.id === id) ? { ...g, questions: g.questions.filter((q) => q.id !== id) } : g));
}

/** The groups with one question moved to place `to` inside its own group (out-of-range or same place: unchanged). */
export function applyMove(groups: QnGroup[], id: string, to: number): QnGroup[] {
  const f = findQ(groups, id);
  if (!f || to === f.i || to < 0 || to >= f.g.questions.length) return groups;
  return groups.map((g) => {
    if (g !== f.g) return g;
    const qs = [...g.questions];
    const [q] = qs.splice(f.i, 1);
    qs.splice(to, 0, q);
    return { ...g, questions: qs };
  });
}

/**
 * The one-place moves (moveInterviewQuestion calls) that take a question from place `from` to place `to` in its group:
 * |to - from| steps, all up or all down. Each server call re-reads the group, so the steps run one after another.
 */
export function movesFor(from: number, to: number): ('up' | 'down')[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return [];
  return Array.from({ length: Math.abs(to - from) }, () => (to < from ? 'up' : 'down'));
}

/** The moves that undo `moves` (the same count, the other way). */
export const reverseMoves = (moves: ('up' | 'down')[]): ('up' | 'down')[] => moves.map((m) => (m === 'up' ? 'down' : 'up'));

/**
 * Where a dragged row lands: the number of other rows whose middle is above the dragged row's middle now (the demo's
 * rule). `mids` are the other rows' middles in order; `centre` is the dragged row's middle.
 */
export const dropIndex = (mids: number[], centre: number): number => mids.filter((m) => m < centre).length;

// ---------- The edit guard ----------

/**
 * Whether an edit may be written. `current` is the question as the database holds it right before the write (null = gone,
 * 'failed' = the check could not read it); `fromText` is the text the person started editing from. Anything other than
 * the same text means someone changed it in between: refuse, never overwrite.
 */
export function guardEdit(current: { text: string } | null | 'failed', fromText: string, words?: string): 'ok' | 'saved' | 'gone' | 'changed' | 'failed' {
  if (current === 'failed') return 'failed';
  if (current === null) return 'gone';
  // The question already holds these words (a first try that saved but lost its answer): it saved, nothing to send.
  if (words !== undefined && clean(current.text) === clean(words)) return 'saved';
  return clean(current.text) === clean(fromText) ? 'ok' : 'changed';
}

/**
 * Whether Undo of an add may remove the question: only while it still holds exactly the words that were added (someone
 * may have changed it since). Gone already = nothing to remove.
 */
export function guardUndoAdd(current: { text: string } | null | 'failed', words: string): 'ok' | 'gone' | 'changed' | 'failed' {
  if (current === 'failed') return 'failed';
  if (current === null) return 'gone';
  return clean(current.text) === clean(words) ? 'ok' : 'changed';
}

// ---------- Failed saves the server later lists ----------

/** A save that did not go through, kept with the person's words (lib/questions-store.ts). */
export type NotSaved =
  | { key: string; kind: 'add'; /** The cycle it was for. */ cycleId: string; gk: string; words: string; /** Ids the group held before the add (a new id with these words = it saved). */ knownIds: string[]; message: string; busy?: boolean }
  | { key: string; kind: 'edit'; /** The cycle it was for. */ cycleId: string; gk: string; qid: string; words: string; /** The text the edit started from (the guard compares it). */ fromText: string; message: string; conflict: boolean; busy?: boolean };

/** A failed save kept from another cycle: it keeps its words (Copy, Remove) but is never retried against this cycle. */
export const isStale = (n: NotSaved, cycleId: string | null): boolean => n.cycleId !== (cycleId ?? '');

/** True when the server's groups show that this failed save went through after all (its words are on the page). */
export function isListed(n: NotSaved, groups: QnGroup[]): boolean {
  const words = clean(n.words);
  if (n.kind === 'edit') {
    const f = findQ(groups, n.qid);
    return !!f && clean(f.g.questions[f.i].text) === words;
  }
  const g = groups.find((x) => gkOf(x.key) === n.gk);
  const known = new Set(n.knownIds);
  return !!g && g.questions.some((q) => !known.has(q.id) && clean(q.text) === words);
}

/** A failed edit whose question is gone has nothing left to retry against (it shows "That question is gone."). */
export const isOrphan = (n: NotSaved, groups: QnGroup[]): boolean => n.kind === 'edit' && !findQ(groups, n.qid);

/**
 * What a retry of a failed add does, from a fresh read of the group: the words are already there (the first try saved,
 * only its answer was lost) = 'already', so nothing is sent twice; otherwise 'send'. The existing add action makes the id
 * on the server, so this read is what stops a twin.
 */
export function retryAdd(n: Extract<NotSaved, { kind: 'add' }>, fresh: QnGroup[] | 'failed'): 'already' | 'send' | 'failed' {
  if (fresh === 'failed') return 'failed';
  return isListed(n, fresh) ? 'already' : 'send';
}

// ---------- Ids, the move lock, the starter count, pastes ----------

/** A just-added question's id until the server answers with its real one. Nothing is sent for it while it has this id. */
export const isTmp = (id: string): boolean => id.startsWith('tmp-');

/** A move whose answer never came (a timeout) may still land: moves stay locked until the page reads the server again. */
export const locksMoves = (o: WriteOutcome): boolean => !o.ok && o.kind === 'timeout';

/** Moves are locked while the read they were locked on is still the one on the page (a new read lifts the lock). */
export const movesLocked = (lockedOn: unknown, now: unknown): boolean => lockedOn !== null && lockedOn !== undefined && lockedOn === now;

/** What the starter questions' saved line says: the true number added, or that they are on the list. */
export function starterWhat(added: number | undefined, full: number): string {
  if (!added || added < 1) return 'The starter questions are on the list';
  if (added === full) return `Added the ${full} starter questions`;
  return added === 1 ? 'Added 1 starter question' : `Added ${added} starter questions`;
}

/** Whether a paste makes the field longer than the limit (the field then cuts it). */
export const pasteCuts = (valueLen: number, selectedLen: number, pasteLen: number, max = MAX_CHARS): boolean => valueLen - selectedLen + pasteLen > max;

// ---------- Words and focus ----------

/** The line after a saved action ("Saved question 3, 9:14 AM"). */
export const noteWords = (what: string, at: string): string => `${what}, ${at}`;

/** What the live region says once an action saved. */
export const savedSay = (what: string, undo: boolean): string => `${what}. Saved.${undo ? ' Undo available.' : ''}`;

/**
 * Whether focus may move after a write that finished later. Never while the person is typing in a field (they started
 * something else); a move the person asked for with a click or a key always may.
 */
export const mayMoveFocus = (afterWrite: boolean, activeTag: string | undefined): boolean => !afterWrite || !['INPUT', 'TEXTAREA', 'SELECT'].includes((activeTag ?? '').toUpperCase());

/** Waits for `p` at most `ms`; past that the answer is 'timeout' (the write may still finish on the server). */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<'timeout'>((res) => {
    t = setTimeout(() => res('timeout'), ms);
  });
  try {
    return await Promise.race([p, timer]);
  } finally {
    if (t) clearTimeout(t);
  }
}

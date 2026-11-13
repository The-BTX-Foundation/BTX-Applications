// The Year over year figure boxes as one pure state machine (the Goals board runs it with useReducer). Kept here, free of
// React, so the order of events (save, refused save, undo, refused undo, fresh server data) is unit-tested
// (tests/goals-figures.test.ts). Keys are "metric:year" (lib/goals-map.ts figureKey).
//
// Rules for refused live writes:
// - every refusal marks the server data as needing a reload (`seenSig` = FORCE): the next refresh replaces every cell
//   with what the database holds, so the screen cannot keep a figure the database does not have;
// - a refused Save shows the cell as the server had it before the save (the save did not happen);
// - a refused Undo keeps showing the saved figure (the database still holds it) with the error line;
// - a refusal that belongs to an older save of the cell (the person has saved it again since) changes nothing on screen;
// - an Undo of a Save that was itself refused has nothing to undo: no write, no second error (undoOutcome).
import type { GoalsCaps } from './goals-view';

/** "Couldn't save. Try again." after a refused live write (DESIGN-DNA, Writes). */
export const SAVE_ERR = "Couldn't save. Try again.";
/** A `seenSig` no real signature equals: the next server data is taken in, whatever it is. */
export const FORCE = '\u0000reload';

/** Cell key -> value (money in cents). */
export type Figs = Record<string, number>;

/** The last save: the cell, when, the value saved, the value before (for Undo) and its number (`seq`, per page). */
export type Saved = { k: string; at: string; value: number; before: number | null; seq: number };

export type FigState = {
  figs: Figs;
  /** The open box's cell (one at a time), or null. */
  open: string | null;
  /** What is typed in the open box. */
  typed: string;
  /** The open box's error line, or ''. */
  err: string;
  saved: Saved | null;
  /** A refused write whose box could not reopen (another box was open, or it was an Undo): the error line under its list. */
  bad: string | null;
  /** The newest save's number per cell: a refusal for an older one is stale. */
  seqs: Record<string, number>;
  /** The signature of the server data last taken in (FORCE after a refused write). */
  seenSig: string;
};

export type FigAction =
  | { type: 'open'; k: string }
  | { type: 'type'; text: string }
  | { type: 'cancel' }
  | { type: 'invalid'; error: string }
  | { type: 'save'; k: string; value: number; at: string; seq: number }
  | { type: 'saveRefused'; k: string; seq: number; text: string; server: Figs }
  | { type: 'undo' }
  | { type: 'undoRefused'; k: string; seq: number; value: number }
  | { type: 'server'; sig: string; figs: Figs; quiet: boolean };

/** The starting state: the server's figures and the box the page opens with (only when figures can be added). */
export function initFigs(figs: Figs, sig: string, openFigure: string | null, caps: GoalsCaps): FigState {
  return { figs, open: caps.figure ? openFigure : null, typed: '', err: '', saved: null, bad: null, seqs: {}, seenSig: sig };
}

// The cell put back to the server's value (or emptied when the server has none).
function fromServer(figs: Figs, k: string, server: Figs): Figs {
  const n = { ...figs };
  if (k in server) n[k] = server[k];
  else delete n[k];
  return n;
}

// True when a refusal belongs to the newest save of its cell (an older save's refusal is stale).
const current = (s: FigState, k: string, seq: number) => s.seqs[k] === seq;

/** The next state. `caps` gates the controls: nothing opens without `figure`, nothing undoes without `figureUndo`. */
export function figReducer(caps: GoalsCaps) {
  return (s: FigState, a: FigAction): FigState => {
    switch (a.type) {
      case 'open':
        return caps.figure ? { ...s, open: a.k, typed: '', err: '' } : s;
      case 'type':
        return { ...s, typed: a.text };
      case 'cancel':
        return { ...s, open: null, typed: '', err: '' };
      case 'invalid':
        return { ...s, err: a.error };
      case 'save':
        if (!caps.figure) return s;
        return {
          ...s,
          figs: { ...s.figs, [a.k]: a.value },
          saved: { k: a.k, at: a.at, value: a.value, before: s.figs[a.k] ?? null, seq: a.seq },
          seqs: { ...s.seqs, [a.k]: a.seq },
          open: null,
          typed: '',
          err: '',
          bad: null,
        };
      case 'saveRefused': {
        if (!current(s, a.k, a.seq)) return { ...s, seenSig: FORCE };
        // Back to the server's value. The box reopens with what was typed, unless the person has since opened another
        // box: their typing there is kept and the error shows under this cell's list instead.
        const base = { ...s, figs: fromServer(s.figs, a.k, a.server), saved: s.saved?.k === a.k ? null : s.saved, seenSig: FORCE };
        if (s.open == null || s.open === a.k) return { ...base, open: a.k, typed: a.text, err: SAVE_ERR, bad: null };
        return { ...base, bad: a.k };
      }
      case 'undo': {
        if (!caps.figureUndo || !s.saved) return s;
        const { k, before } = s.saved;
        const figs = { ...s.figs };
        if (before == null) delete figs[k];
        else figs[k] = before;
        // An undone first entry opens its box again (the demo); an undone change shows the old figure.
        return before == null ? { ...s, figs, saved: null, bad: null, open: k, typed: '', err: '' } : { ...s, figs, saved: null, bad: null };
      }
      case 'undoRefused': {
        // Stale (the cell was saved again since, so its newest save stands): only the reload.
        if (!current(s, a.k, a.seq) || s.saved?.k === a.k) return { ...s, seenSig: FORCE };
        // The database still holds the saved figure: show it, close the box the Undo opened, the error line, reload.
        const mine = s.open === a.k;
        return { ...s, figs: { ...s.figs, [a.k]: a.value }, open: mine ? null : s.open, typed: mine ? '' : s.typed, err: mine ? '' : s.err, bad: a.k, seenSig: FORCE };
      }
      case 'server':
        return shouldReseed(a.sig, s.seenSig, a.quiet) ? { ...s, figs: a.figs, seenSig: a.sig } : s;
    }
  };
}

/**
 * Where focus goes after a refusal, decided on the state just before it: the reopened box (Save) or the cell's row (Undo),
 * but only when no other box is open. A person typing in another box keeps their focus; a stale refusal moves nothing.
 */
export function refusalFocus(s: FigState, a: Extract<FigAction, { type: 'saveRefused' | 'undoRefused' }>): string[] | null {
  if (!current(s, a.k, a.seq)) return null;
  if (a.type === 'undoRefused' && s.saved?.k === a.k) return null;
  if (s.open != null && s.open !== a.k) return null;
  const row = `[data-row="${a.k}"]`;
  return a.type === 'saveRefused' ? ['#gl-in', row] : [row];
}

/**
 * What an Undo's live write came to. When the Save it undoes was refused there is nothing to undo ('nothing': no error,
 * the save's own error line stands); otherwise the reverse write worked ('done') or was refused ('refused').
 */
export function undoOutcome(saveOk: boolean, undoOk: boolean): 'done' | 'nothing' | 'refused' {
  if (!saveOk) return 'nothing';
  return undoOk ? 'done' : 'refused';
}

/**
 * Whether fresh server data replaces the cells: only when it differs from what was last taken in (or a reload is forced)
 * and the page is quiet: no write running, the data on hand is not older than a write, and no refresh is pending.
 */
export function shouldReseed(sig: string, seenSig: string, quiet: boolean): boolean {
  return sig !== seenSig && quiet;
}

/**
 * Runs `write` after every earlier write queued on the same key (whether it worked or not), so two writes to one cell
 * reach the database in the order the person made them. Returns the write's own promise.
 */
export function chain<T>(queue: Map<string, Promise<unknown>>, k: string, write: () => Promise<T>): Promise<T> {
  const prev = queue.get(k) ?? Promise.resolve();
  const next = prev.then(write, write);
  queue.set(k, next);
  return next;
}

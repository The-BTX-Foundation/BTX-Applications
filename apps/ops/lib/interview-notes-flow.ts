// The notes boxes' autosave, as pure functions (tests/interview-notes-flow.test.ts). One box = one question's notes or the
// overall notes. Words are saved a moment after typing stops and when the box loses focus; one save runs per box at a time
// (the next starts when it ends, with the newest words); a failed save keeps the words in the box and says "Not saved"
// with Retry; words typed while a save runs are never marked saved by that save.

/** How long after the last key press a box saves. */
export const DEBOUNCE_MS = 900;

export type BoxState = 'idle' | 'saving' | 'saved' | 'failed';

/** One box: the words on screen, the words the server last confirmed, and the save state. */
export type Box = {
  text: string;
  saved: string;
  state: BoxState;
  /** The words of the save now running (null when none). */
  sending: string | null;
};

export const newBox = (saved: string): Box => ({ text: saved, saved, state: 'idle', sending: null });

/** The words on screen differ from what the server holds. */
export const dirty = (b: Box): boolean => b.text !== b.saved;

/** A save should start now: the words differ, and no save is running for this box. */
export const shouldSave = (b: Box): boolean => b.sending === null && dirty(b);

export type BoxEvent = { type: 'type'; text: string } | { type: 'start' } | { type: 'done'; ok: boolean } | { type: 'server'; saved: string };

/** The next state of one box. */
export function boxReducer(b: Box, e: BoxEvent): Box {
  switch (e.type) {
    case 'type':
      // A failed box stays "failed" until a save succeeds, so the Retry stays visible while the person keeps typing.
      return { ...b, text: e.text, state: b.state === 'saved' ? 'idle' : b.state };
    case 'start':
      return shouldSave(b) ? { ...b, sending: b.text, state: 'saving' } : b;
    case 'done': {
      if (b.sending === null) return b;
      if (!e.ok) return { ...b, sending: null, state: 'failed' };
      const saved = b.sending;
      // Saved what was sent; words typed since then still wait for the next save.
      return { ...b, saved, sending: null, state: b.text === saved ? 'saved' : 'idle' };
    }
    case 'server':
      // A fresh read from the server: taken only by a box with nothing unsaved and no save running.
      return b.sending === null && !dirty(b) ? { ...b, text: e.saved, saved: e.saved } : b;
  }
}

/** The words under a box. */
export function boxStatus(b: Box): string {
  if (b.state === 'saving') return 'Saving…';
  if (b.state === 'failed') return 'Not saved';
  if (b.state === 'saved') return 'Saved';
  return '';
}

/** Some box holds words the server does not have (the page warns before closing). */
export const anyUnsaved = (boxes: Record<string, Box>): boolean => Object.values(boxes).some((b) => dirty(b) || b.sending !== null);

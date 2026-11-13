// The Scoring page's "not saved" memory: a draft the server refused and private-note words not yet saved, kept outside
// React so they outlive the board (a re-read or a visit to another page and back draws a new one), owned by ONE signed-in
// person at a time like Board members' nudge words (lib/people-unsent.ts). Only that person's own picks and own note are
// ever kept here (the view never holds anyone else's); reads for anyone but the owner return nothing, and a board drawn for
// a different person clears it first. In memory only: nothing goes to the URL or browser storage, so closing the tab
// drops it (the board warns before that). No database.

export type UnsentDraft = { picks: Record<string, number>; error: string };

let owner: string | null = null;
let drafts = new Map<string, UnsentDraft>();
let notes = new Map<string, string>();

/** Makes `userId` the owner; someone else's entries are dropped first. */
export function claimUnsent(userId: string): void {
  if (owner === userId) return;
  owner = userId;
  drafts = new Map();
  notes = new Map();
}

/** The owner's refused drafts by application id (a copy); nothing for anyone else. */
export function unsentDrafts(userId: string): Map<string, UnsentDraft> {
  return owner === userId ? new Map(drafts) : new Map();
}

/** The owner's unsaved note words by application id (a copy); nothing for anyone else. */
export function unsentNotes(userId: string): Map<string, string> {
  return owner === userId ? new Map(notes) : new Map();
}

/** Keeps a refused draft; `null` drops it (saved, or the sheet is published). */
export function keepDraft(userId: string, applicationId: string, d: UnsentDraft | null): void {
  if (owner !== userId) return;
  if (d) drafts.set(applicationId, { picks: { ...d.picks }, error: d.error });
  else drafts.delete(applicationId);
}

/** Keeps unsaved note words; `null` drops them (saved, or back to the saved words). */
export function keepNote(userId: string, applicationId: string, text: string | null): void {
  if (owner !== userId) return;
  if (text === null) notes.delete(applicationId);
  else notes.set(applicationId, text);
}

/** Empties the memory and forgets its owner (tests). */
export function resetUnsent(): void {
  owner = null;
  drafts = new Map();
  notes = new Map();
}

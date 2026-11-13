// Interviews > Your availability: the draft rules, kept pure so they can be tested without a browser. The draft is what
// the screen shows; the base is what the server is known to hold (the last read, or the last confirmed send). Every
// change is a step with the draft before it, so Undo can go back; after a send that wasn't confirmed, the page re-reads
// and the steps are rebased on the re-read server state, so Undo never shows an old state as if it were saved.
import { draftSig, type Spans } from './availability-plan';

/** The draft: free time, the private names, the limit and the note sent with them. */
export type Snap = { spans: Spans; conflicts: string[]; limit: number | null; text: string };
/** One change not sent yet: the draft before it, its words (several after a rebase), and where its Undo line sits. */
export type Change = { before: Snap; text: string; where: string; texts?: string[] };

/** The plain line when the screen and the server differ in a way no listed change explains. */
export const DIFFER = "Your saved times differ from what's shown.";
/** After a re-read: the server holds exactly the draft. */
export const CHECK_SAVED = 'Checked: your times are saved.';
/** After an unanswered send's re-read: the server doesn't hold the draft. */
export const CHECK_NOT_SAVED = "Checked: these changes aren't saved yet. Send again.";

/**
 * The comparable signature of a draft as the server would store it: the note trimmed, the names as a sorted set (the
 * server trims the note, and returns names in the order they were added), the ranges by day and start.
 */
export function snapCmp(s: Snap): string {
  const names = [...new Set(s.conflicts.map((c) => c.trim()))].sort();
  return `${draftSig(s.spans, names, s.limit)}|${s.text.trim()}`;
}

/** True when two drafts would be stored the same. */
export const sameSnap = (a: Snap, b: Snap): boolean => snapCmp(a) === snapCmp(b);

/** Every change's words in order (a rebased step carries the words of the steps it replaced). */
export function changeTexts(stack: Change[]): string[] {
  return stack.flatMap((c) => c.texts ?? [c.text]);
}

/**
 * A change on top of `from`: null when edits are locked (a send or a read is running) or nothing changed; else the new
 * stack and draft.
 */
export function pushChange(stack: Change[], from: Snap, after: Snap, text: string, where: string, locked: boolean): { stack: Change[]; draft: Snap } | null {
  if (locked || sameSnap(from, after)) return null;
  return { stack: [...stack, { before: from, text, where }], draft: after };
}

/** Undo of the last step: the draft before it, and the stack without it (null when there is nothing to undo). */
export function undoChange(stack: Change[]): { stack: Change[]; draft: Snap; change: Change } | null {
  const top = stack[stack.length - 1];
  if (!top) return null;
  return { stack: stack.slice(0, -1), draft: top.before, change: top };
}

/**
 * After a send that wasn't confirmed (refused, failed part way, or no answer) and the re-read: when the server holds the
 * draft, it was saved (`saved`, the list clears). Otherwise every step folds into one whose "before" is the re-read
 * server state, so Undo returns to what is really saved; the words of the steps stay listed.
 */
export function rebaseAfterCheck(server: Snap, draft: Snap, stack: Change[]): { stack: Change[]; saved: boolean } {
  if (sameSnap(server, draft)) return { stack: [], saved: true };
  if (!stack.length) return { stack: [], saved: false };
  const texts = changeTexts(stack);
  return { stack: [{ before: server, text: texts.length === 1 ? texts[0] : 'your unsent changes', where: stack[stack.length - 1].where, texts }], saved: false };
}

/** True when the screen differs from the server in a way no listed change explains (the Send box stays open with DIFFER). */
export function unexplained(draft: Snap, base: Snap, stack: Change[]): boolean {
  return stack.length === 0 && !sameSnap(draft, base);
}

/** True when the Send box shows: changes listed, an unexplained difference, an error, or free time never sent. */
export function needsOpen(o: { pending: number; differs: boolean; error: boolean; neverSent: boolean }): boolean {
  return o.pending > 0 || o.differs || o.error || o.neverSent;
}

/**
 * The reader's answer applied to the CURRENT draft (not the one at the time of the press): its times replace the free
 * time, the note becomes the typed words.
 */
export function readerDraft(current: Snap, spans: Spans, typed: string): Snap {
  return { ...current, spans, text: typed };
}

/** The add line clears after the reader's answer only if it still holds the words that were read. */
export function clearAddAfterRead(addNow: string, typed: string): boolean {
  return addNow === typed;
}

/** The span an open editor points at, by its start and end (-1 when it's gone, e.g. after a re-read). */
export function spanIndex(spans: Spans, day: string, s: number, e: number): number {
  return (spans[day] ?? []).findIndex(([a, b]) => a === s && b === e);
}

/** The words when a quick pick adds nothing: no days of that kind in the window, or already free then. */
export function pickMiss(kind: 'weekdays' | 'weekends' | 'every', dayCount: number): string {
  if (dayCount === 0) return kind === 'weekends' ? 'No weekend days in this window.' : kind === 'weekdays' ? 'No weekdays in this window.' : 'No days in this window.';
  return "You're already free then.";
}

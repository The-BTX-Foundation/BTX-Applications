// The Board members page's unsent nudge words, kept outside React so they outlive the board (a refresh that fails draws a
// new one) and owned by ONE signed-in person at a time, like Board chat's drafts (lib/chat-unsent.ts). One entry per
// person the nudge is for; the gold callout and that person's row share it. Reads for anyone but the owner return nothing,
// and a board drawn for a different person clears the store first. Read through useSyncExternalStore. No database.

/** Edited nudge words by the id of the person they are for. */
export type NudgeWords = Readonly<Record<string, string>>;

const EMPTY: NudgeWords = {};
let owner: string | null = null;
let words: NudgeWords = EMPTY;
const listeners = new Set<() => void>();

function changed() {
  for (const fn of listeners) fn();
}

/** Makes `userId` the owner; someone else's words are dropped first. Quiet: a board calls it while it draws. */
export function claimNudgeWords(userId: string): void {
  if (owner === userId) return;
  owner = userId;
  words = EMPTY;
}

/** Calls `fn` on every change; returns the unsubscribe. */
export function subscribeNudgeWords(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The owner's words (a stable object until the next change); nothing for anyone else. */
export function nudgeWordsSnapshot(userId: string): NudgeWords {
  return owner === userId ? words : EMPTY;
}

/** The server render's words: none. */
export function nudgeWordsServerSnapshot(): NudgeWords {
  return EMPTY;
}

/** Sets the words for person `to`; `null` drops them (sent or cancelled). */
export function setNudgeWords(userId: string, to: string, text: string | null): void {
  if (owner !== userId) return;
  if (text === null ? !(to in words) : words[to] === text) return;
  const next = { ...words };
  if (text === null) delete next[to];
  else next[to] = text;
  words = next;
  changed();
}

/**
 * Sends a nudge so its words stay fixed: the exact words being sent are saved for `to` when the send STARTS (so a refresh
 * that changes the drafted text never changes what Retry sends, and Retry reuses the same message id), dropped once it
 * saved, and kept when it failed. Resolves or rejects with `send`'s result.
 */
export async function sendKeepingWords<T>(userId: string, to: string, body: string, send: (body: string) => Promise<T>): Promise<T> {
  setNudgeWords(userId, to, body);
  const r = await send(body);
  setNudgeWords(userId, to, null);
  return r;
}

/** Empties the store and forgets its owner (tests). */
export function resetNudgeWords(): void {
  owner = null;
  words = EMPTY;
  changed();
}

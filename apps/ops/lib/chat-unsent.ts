// Board chat's state that must outlive the board itself (the page draws a new board when a refresh fails), kept outside
// React and owned by ONE signed-in person at a time:
// - "Not sent" rows: live messages whose save failed. Each stays at the bottom of its own target's thread with the
//   person's words, "Couldn't save. Try again.", Retry and Remove, until Retry saves it, Remove drops it, or a refresh
//   shows its id saved;
// - drafts: what the person has typed in each view (All areas, an area, a direct conversation).
// Everything is keyed by the person: reads for anyone else return nothing, and a board drawn for a different person
// clears the store first (sign-out and sign-in in the same tab must never show, or let anyone retry, someone else's
// words). Read in components through useSyncExternalStore. No reads or writes to the database.
import { withDraft, type Drafts } from './chat-map';

/** One message that did not save. Its id is the row's own: Retry sends the same words with this same id. */
export type Unsent = {
  id: string;
  /** The channel list key it was sent to (an area channel, or `direct:<userId>`). */
  target: string;
  text: string;
  /** "failed" draws the error words and the buttons; "sending" while a Retry runs. */
  state: 'failed' | 'sending';
};

/** The rows by target key; replaced (never changed in place) on every change, so it can be a store snapshot. */
export type UnsentStore = Readonly<Record<string, readonly Unsent[]>>;

const EMPTY_ROWS: UnsentStore = {};
const EMPTY_DRAFTS: Drafts = {};
/** The person the store belongs to (null before any board has claimed it). */
let owner: string | null = null;
let rows: UnsentStore = EMPTY_ROWS;
let drafts: Drafts = EMPTY_DRAFTS;
const listeners = new Set<() => void>();

// Tells every subscriber the store changed.
function changed() {
  for (const fn of listeners) fn();
}

// True when `userId` owns the store (writes for anyone else are ignored).
function owns(userId: string): boolean {
  return owner === userId;
}

/**
 * Makes `userId` the store's owner. When someone else owned it, their rows and drafts are dropped first; the same person
 * claiming it again (a remount) keeps everything. Quiet (no subscriber is told): a board calls it while it draws, before
 * it reads the store.
 */
export function claimChatStore(userId: string): void {
  if (owner === userId) return;
  owner = userId;
  rows = EMPTY_ROWS;
  drafts = EMPTY_DRAFTS;
}

/** Calls `fn` on every change; returns the unsubscribe. */
export function subscribeUnsent(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The person's Not-sent rows (a stable object until the next change); nothing for anyone but the owner. */
export function unsentSnapshot(userId: string): UnsentStore {
  return owns(userId) ? rows : EMPTY_ROWS;
}

/** The server render's rows: none (they only exist in the browser). */
export function unsentServerSnapshot(): UnsentStore {
  return EMPTY_ROWS;
}

/** The server render's drafts: none. */
export function draftsServerSnapshot(): Drafts {
  return EMPTY_DRAFTS;
}

/** The person's drafts by view key (a stable object until the next change); nothing for anyone but the owner. */
export function draftsSnapshot(userId: string): Drafts {
  return owns(userId) ? drafts : EMPTY_DRAFTS;
}

/** Sets one view's draft for the person; an empty draft is dropped (sent or cleared). */
export function setStoreDraft(userId: string, view: string, text: string): void {
  if (!owns(userId) || (drafts[view] ?? '') === text) return;
  drafts = withDraft(drafts, view, text);
  changed();
}

/** Adds a failed message at the bottom of its target's rows (or marks an existing row with that id failed again). */
export function addUnsent(userId: string, row: Unsent): void {
  if (!owns(userId)) return;
  const list = rows[row.target] ?? [];
  const next = list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
  rows = { ...rows, [row.target]: next };
  changed();
}

/** Changes one row's state ("sending" while Retry runs, "failed" when it fails again). */
export function setUnsentState(userId: string, id: string, state: Unsent['state']): void {
  if (!owns(userId)) return;
  rows = Object.fromEntries(Object.entries(rows).map(([k, list]) => [k, list.map((r) => (r.id === id ? { ...r, state } : r))]));
  changed();
}

/** Drops rows by id: Remove, a Retry that saved, or a refresh that shows the message saved. No change when none match. */
export function dropUnsent(userId: string, ids: Iterable<string>): void {
  if (!owns(userId)) return;
  const gone = new Set(ids);
  if (!Object.values(rows).some((list) => list.some((r) => gone.has(r.id)))) return;
  const next: Record<string, readonly Unsent[]> = {};
  for (const [k, list] of Object.entries(rows)) {
    const kept = list.filter((r) => !gone.has(r.id));
    if (kept.length) next[k] = kept;
  }
  rows = next;
  changed();
}

/** The rows a view draws: the open target's, or every area target's in All areas (`targets`). */
export function unsentIn(store: UnsentStore, targets: string[]): Unsent[] {
  return targets.flatMap((t) => [...(store[t] ?? [])]);
}

/** Empties the store and forgets its owner (tests). */
export function resetUnsent(): void {
  owner = null;
  rows = EMPTY_ROWS;
  drafts = EMPTY_DRAFTS;
  changed();
}

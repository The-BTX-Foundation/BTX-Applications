// The Interview questions page's "Not saved" place: adds and edits that did not go through, kept with the person's words
// so nothing typed is lost, with Try again and Dismiss. It lives at module level (it outlives a re-render, a refresh or a
// visit to another page) and belongs to one signed-in person (keyed by user id), read through useSyncExternalStore.
// A board drawn for a different person clears it first (claimNotSaved, as lib/chat-unsent.ts does), and the board clears
// it when the browser client says the person signed out. Copy-adapted from lib/instagram-unadded.ts (candidate to promote).
import { isListed, isStale, type NotSaved } from './questions-flow';
import type { QnGroup } from './questions-view';

const EMPTY: NotSaved[] = [];
const store = new Map<string, NotSaved[]>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const who = (me: string | null) => me ?? '';
/** The person the store belongs to (undefined before any board has claimed it). */
let owner: string | undefined;
/** Counts up for the life of the page (never restarts with a board), so every just-added question's key is new. */
let seq = 0;

/** A new "tmp-" id for a just-added question; also its "Not saved" key, so a later failure never replaces an earlier one. */
export const nextTmpId = (): string => `tmp-${++seq}`;

/**
 * Makes `me` the store's owner. When someone else owned it, everything kept is dropped first; the same person claiming it
 * again (a remount) keeps everything. Quiet (no listener is told): the board calls it while it draws, before it reads.
 */
export function claimNotSaved(me: string | null): void {
  if (owner === who(me)) return;
  owner = who(me);
  store.clear();
}

/** Drops everything kept (the person signed out). */
export function clearNotSaved(): void {
  if (store.size === 0) return;
  store.clear();
  emit();
}

/** Subscribes to changes (for useSyncExternalStore). */
export function subscribeNotSaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** This person's list (the same array until it changes). */
export const notSavedSnapshot = (me: string | null): NotSaved[] => store.get(who(me)) ?? EMPTY;
/** The server draws none. */
export const notSavedServerSnapshot = (): NotSaved[] => EMPTY;

/** Keeps one failed save (replacing an older entry with the same key). */
export function keepNotSaved(me: string | null, item: NotSaved): void {
  store.set(who(me), [...notSavedSnapshot(me).filter((x) => x.key !== item.key), item]);
  emit();
}

/** Changes one entry (a retry starts or fails again). */
export function patchNotSaved(me: string | null, key: string, patch: Partial<NotSaved>): void {
  store.set(
    who(me),
    notSavedSnapshot(me).map((x) => (x.key === key ? ({ ...x, ...patch } as NotSaved) : x)),
  );
  emit();
}

/** Drops one entry (it saved, or the person dismissed it). */
export function dropNotSaved(me: string | null, key: string): void {
  const now = notSavedSnapshot(me);
  if (!now.some((x) => x.key === key)) return;
  store.set(
    who(me),
    now.filter((x) => x.key !== key),
  );
  emit();
}

/**
 * Drops every entry of this cycle (not being retried) whose words the server's groups now show: the save went through after
 * all. Entries from another cycle are never matched against this one.
 */
export function dropListedNotSaved(me: string | null, groups: QnGroup[], cycleId: string | null): void {
  const now = notSavedSnapshot(me);
  const keep = now.filter((x) => x.busy || isStale(x, cycleId) || !isListed(x, groups));
  if (keep.length === now.length) return;
  store.set(who(me), keep);
  emit();
}

// The Instagram page's "Not added" place: posts whose add failed, kept with their words so nothing typed is lost, with
// Try again and Remove. It lives at module level (so it outlives a re-render, a refresh or a visit to another page) and
// belongs to one signed-in person (keyed by user id), read through useSyncExternalStore.
import type { NewPost } from './instagram-writes';

/** One post that did not save. `adding` while a retry runs. `id` is the id its last try used (live), so a save that went
 * through after all clears it once the server lists that id. */
export type NotAdded = { key: string; post: NewPost; state: 'failed' | 'adding'; id?: string };

const EMPTY: NotAdded[] = [];
const store = new Map<string, NotAdded[]>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const who = (me: string | null) => me ?? '';

/** Subscribes to changes (for useSyncExternalStore). */
export function subscribeNotAdded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** This person's list (the same array until it changes). */
export const notAddedSnapshot = (me: string | null): NotAdded[] => store.get(who(me)) ?? EMPTY;
/** The server draws none. */
export const notAddedServerSnapshot = (): NotAdded[] => EMPTY;

/** Keeps one failed post (replacing an older entry with the same key). */
export function keepNotAdded(me: string | null, item: NotAdded): void {
  store.set(who(me), [...notAddedSnapshot(me).filter((x) => x.key !== item.key), item]);
  emit();
}

/** Marks one entry as being retried, or failed again. */
export function setNotAddedState(me: string | null, key: string, state: NotAdded['state']): void {
  store.set(
    who(me),
    notAddedSnapshot(me).map((x) => (x.key === key ? { ...x, state } : x)),
  );
  emit();
}

/** Drops one entry (it saved, or the person removed it). */
export function dropNotAdded(me: string | null, key: string): void {
  store.set(
    who(me),
    notAddedSnapshot(me).filter((x) => x.key !== key),
  );
  emit();
}

/** Drops every entry whose last try the server now lists (the save went through after all). */
export function dropListedNotAdded(me: string | null, listed: Set<string>): void {
  const now = notAddedSnapshot(me);
  const keep = now.filter((x) => !x.id || !listed.has(x.id));
  if (keep.length === now.length) return;
  store.set(who(me), keep);
  emit();
}

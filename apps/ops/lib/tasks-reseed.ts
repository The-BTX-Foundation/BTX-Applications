// The Tasks board's rule for taking in a new server task list without breaking what is on screen (pure; unit tested in
// tests/tasks-reseed.test.ts). Rows keep their on-screen state (a ticked row or its Undo line stays until its timers
// finish), new rows join, rows the server dropped leave, and a live add still waiting for its insert stays. The server
// has the last word on a row it lists as open: a row the board had hidden ('gone', say after an Undo whose answer was
// lost) comes back as an open row, so it is never hidden for the rest of the visit.

/** The board-only fields a row carries on top of the server's task. */
export type Seeded = { id: string; phase: string; nonce: number; fx: unknown; decided: unknown; decidedStep: number };

/** Merges `fresh` (the server's open tasks) into `cur` (the board's rows). `make` turns a server task into a new row. */
export function reseed<T extends { id: string }, B extends T & Seeded>(cur: B[], fresh: T[], make: (t: T) => B): B[] {
  const had = new Map(cur.map((t) => [t.id, t]));
  const ids = new Set(fresh.map((t) => t.id));
  const next: B[] = fresh.map((t) => {
    const old = had.get(t.id);
    if (!old || old.phase === 'gone') return make(t);
    return { ...make(t), phase: old.phase, nonce: old.nonce, fx: old.fx, decided: old.decided, decidedStep: old.decidedStep };
  });
  for (const t of cur) if (!ids.has(t.id) && (t.id.startsWith('new-') || (t.phase !== 'open' && t.phase !== 'gone'))) next.push(t);
  return next;
}

/**
 * Whether the board takes in the server's list now: after a new list (`sigChanged`), after every settled refresh
 * (`refreshed`, even when the list looks the same, so a row hidden after a failed Undo whose reopen did land comes back),
 * or when the server lists a row the board hid (`goneListed`). Never while a write runs, while the data on hand predates
 * a write (`stale`), or while a refresh is still on its way.
 */
export function shouldReseed(o: { sigChanged: boolean; refreshed: boolean; goneListed: boolean; busy: number; stale: boolean; refreshing: boolean }): boolean {
  return (o.sigChanged || o.refreshed || o.goneListed) && o.busy === 0 && !o.stale && !o.refreshing;
}

/**
 * A saved add: its temporary row takes the real id. When a row with that id is already on the board (a retry of an add
 * whose first try did land, which the refresh already brought in), the temporary row is dropped instead, so the task is
 * never listed twice.
 */
export function settleAdd<B extends { id: string; fx: unknown }>(list: B[], tmp: string, real: string): B[] {
  if (list.some((t) => t.id === real)) return list.filter((t) => t.id !== tmp);
  return list.map((t) => (t.id === tmp ? { ...t, id: real, fx: null } : t));
}

/** A saved comment: the same rule inside one task's thread (the temporary comment takes the real id, or leaves). */
export function settleComment<C extends { id: string }>(thread: C[], tmp: string, real: string): C[] {
  if (thread.some((c) => c.id === real)) return thread.filter((c) => c.id !== tmp);
  return thread.map((c) => (c.id === tmp ? { ...c, id: real } : c));
}

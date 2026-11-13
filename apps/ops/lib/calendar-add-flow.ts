// The ordering rules behind "Add an event" and its Undo in live mode (Calendar page). Pure, so they are unit-tested
// (tests/calendar-add-flow.test.ts); components/calendar/calendar-board.tsx and calendar-writes.ts use them.
//
// - The event's id is made in the browser (crypto.randomUUID) and sent as calendar_events.id, so the page knows the row's
//   id before the database answers and Undo never has to wait to learn it.
// - A retry of the same failed add (same title, day, time and area) reuses that id. If the first try did save (it timed
//   out after the row was written), the retry's duplicate-key error (23505) means the row is there: success.
// - Insert and delete of one id run one after the other (a queue per id). Undo always queues the delete, even when the
//   insert is still running or reported a failure (a timed-out insert may still have written the row).

/** True when an insert's error means the row is in the table: no error, or a duplicate key (23505, the same id again). */
export function insertSaved(error: unknown): boolean {
  if (!error) return true;
  return typeof error === 'object' && (error as { code?: unknown }).code === '23505';
}

/** What makes two adds "the same add" (a retry). */
export type AddSig = { title: string; day: string; time: number | null; area: string };
const sigKey = (s: AddSig) => `${s.title}\u0000${s.day}\u0000${s.time ?? ''}\u0000${s.area}`;

/**
 * A failed add, kept for its retry: what it saved (sig), its id, and the field exactly as it was (the words plus the chip
 * choices), restored together so the retry reads the same day, time and area and so reuses the id.
 */
export type AddRetry = { sig: AddSig; id: string; text: string; dismissed: { day: boolean; time: boolean }; areaPick: string | null };

/** The id an add uses: the failed add's id when this is a retry of it, else the fresh one. */
export function pickAddId(retry: { sig: AddSig; id: string } | null, sig: AddSig, fresh: string): string {
  return retry && sigKey(retry.sig) === sigKey(sig) ? retry.id : fresh;
}

/**
 * Whether an Undo worked. `deleted` is the number of rows the delete removed (null: the delete itself failed). A row that
 * was saved must be deleted (1); an insert that failed and left nothing behind (0) is fine too.
 */
export function undoWorked(insertOk: boolean, deleted: number | null): boolean {
  if (deleted == null) return false;
  if (deleted >= 1) return true;
  return !insertOk;
}

/** After an insert failed: show "Couldn't save" only when the person has not already undone that add. */
export function showSaveError(insertOk: boolean, undone: boolean): boolean {
  return !insertOk && !undone;
}

/** Runs tasks one after the other per id (a failed task does not stop the next one). */
export function createIdQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return function run<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = tails.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.catch(() => undefined);
    tails.set(id, tail);
    void tail.then(() => {
      if (tails.get(id) === tail) tails.delete(id);
    });
    return next;
  };
}

// The Selection page's writes for LIVE mode (mock mode never calls them; the board changes its own state, like the demo).
// Each wraps one existing server action from lib/actions/selection.ts, called exactly as the old page called it (passed
// in, so tests use stand-ins and this file never pulls server code into a test). Row-level security and the actions
// decide who may write; nothing here widens it.
//
// Releasing decisions emails every submitted applicant and cannot be undone, so runRelease calls releaseAndNotify at most
// once per page visit: a guard refuses a second call while one is running and after one has run (whatever the answer),
// and nothing here ever retries. A release that never answers or fails is "unknown": the board re-reads the page and says
// what already happened. No message returned here carries a name or an email.
import type { EmailOutcome } from '@/lib/release-copy';
import { withTimeout, type Settled } from '@/lib/selection-map';

type Result = { ok: boolean; message: string; id?: string };
type ReleaseAnswer = { ok: true; releasedAt: string; already: boolean; emails: EmailOutcome } | { ok: false; message: string };

/** What recordAward takes (lib/actions/selection.ts). */
export type RecordInput = { cycleId: string | null; applicationId: string; code: string; name: string; kind: 'main' | 'extra'; awardName: string; amountCents: number; note: string };

/** The three server actions the page uses. */
export type SlActions = {
  recordAward: (input: RecordInput) => Promise<Result>;
  undoAward: (awardId: string) => Promise<Result>;
  releaseAndNotify: (cycleId: string) => Promise<ReleaseAnswer>;
};

/** How long a record or undo may take. */
export const SL_WRITE_MS = 15_000;
/**
 * How long the release may take: it stamps the cycle and then sends every decision email in the same server call, so it
 * gets longer than a plain write. Past this it counts as unknown (it may still be running), never as failed.
 */
export const SL_RELEASE_MS = 60_000;

/** The note saved with every award recorded here (the old page's words). */
export const DECISION_NOTE = 'Decided by the board at the selection meeting';

/** How a record or undo ended: saved, refused with the action's message, failed (thrown), or unknown (no answer in time). */
export type WriteResult = { kind: 'saved'; id: string | null } | { kind: 'refused'; message: string } | { kind: 'failed' } | { kind: 'unknown' };

// Turns a raced action call into a WriteResult.
function settle(r: Settled<Result>): WriteResult {
  if (r.kind === 'timeout') return { kind: 'unknown' };
  if (r.kind === 'error') return { kind: 'failed' };
  return r.value.ok ? { kind: 'saved', id: r.value.id ?? null } : { kind: 'refused', message: r.value.message };
}

/** Records an award (the main one or an extra one). */
export async function writeRecord(actions: SlActions, input: Omit<RecordInput, 'note'>, ms = SL_WRITE_MS): Promise<WriteResult> {
  return settle(await withTimeout(actions.recordAward({ ...input, note: DECISION_NOTE }), ms));
}

/** Undoes an award (the action refuses once the letter is out or decisions are released). */
export async function writeUndo(actions: SlActions, awardId: string, ms = SL_WRITE_MS): Promise<WriteResult> {
  return settle(await withTimeout(actions.undoAward(awardId), ms));
}

/** One write at a time for a control: `inFlight` while a call runs; `used` once an irreversible call has been made. */
export type Guard = { inFlight: boolean; used: boolean };
export const newGuard = (): Guard => ({ inFlight: false, used: false });

/**
 * Runs `write` only when no call is in flight on `guard` (and, with `once`, when none has ever run); returns null without
 * calling when refused. The guard is released when the call settles (an irreversible one stays used).
 */
export async function guarded<T>(guard: Guard, once: boolean, write: () => Promise<T>): Promise<T | null> {
  if (guard.inFlight || (once && guard.used)) return null;
  guard.inFlight = true;
  guard.used = true;
  try {
    return await write();
  } finally {
    guard.inFlight = false;
  }
}

/** How the release ended. `busy`: refused without calling (one already ran or is running). */
export type ReleaseOutcome = { kind: 'released'; releasedAt: string; already: boolean; emails: EmailOutcome } | { kind: 'refused'; message: string } | { kind: 'unknown' } | { kind: 'busy' };

/** Releases the decisions and sends the emails: at most one call per guard, never retried. */
export async function runRelease(actions: SlActions, cycleId: string, guard: Guard, ms = SL_RELEASE_MS): Promise<ReleaseOutcome> {
  const r = await guarded(guard, true, () => withTimeout(actions.releaseAndNotify(cycleId), ms));
  if (r == null) return { kind: 'busy' };
  if (r.kind !== 'answer') return { kind: 'unknown' };
  if (!r.value.ok) return { kind: 'refused', message: r.value.message };
  return { kind: 'released', releasedAt: r.value.releasedAt, already: r.value.already, emails: r.value.emails };
}

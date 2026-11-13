// The Awardees page's writes for LIVE mode (mock mode never calls them; the board changes its own state, like the demo).
// Each wraps one existing server action from lib/actions/awardees.ts (passed in, so tests use stand-ins and this file
// never pulls server code into a test): row-level security and the actions decide who may write; nothing here widens it.
// Every call gives up waiting after 15 seconds. A step write that times out counts as failed (the board rolls back and
// the refresh that follows shows what the database really holds). The funds write is money: a timeout is "unknown", so
// the board says it is checking, refreshes, and never offers a second try before the refresh lands. "Already marked sent"
// is passed on as its own answer: the board counts it as saved only after its own unanswered try. No message returned here ever carries a name or an email.
import { fundsOutcome, withTimeout } from '@/lib/awardees-map';

type Result = { ok: boolean; message: string };

/** The two server actions the page uses (lib/actions/awardees.ts). */
export type AwActions = {
  setStepDone: (awardId: string, step: number, done: boolean) => Promise<Result>;
  sendReminder: (awardId: string, step: number) => Promise<Result>;
};

/** How long one write may take. */
export const AW_WRITE_MS = 15_000;

/**
 * Ticks (done) or unticks one of steps 1, 2, 3 or 5 (`i` 0, 1, 2 or 4). True only when the action said it saved. The funds
 * step (`i` 3) is never written here: an untick is refused outright and a tick goes through writeFunds.
 */
export async function writeStep(actions: AwActions, awardId: string, i: number, done: boolean, ms = AW_WRITE_MS): Promise<boolean> {
  if (i === 3 || i < 0 || i > 4) return false;
  const r = await withTimeout(actions.setStepDone(awardId, i + 1, done), ms);
  return r.kind === 'answer' && r.value.ok === true;
}

/**
 * How a funds write ended: saved; already marked sent before this call (the board decides whether that was its own
 * earlier unanswered try); refused with a plain message; or not known (timed out or lost: the payment may have been logged).
 */
export type FundsResult = { kind: 'saved' } | { kind: 'already' } | { kind: 'refused'; message: string } | { kind: 'unknown' };

/** Marks the funds sent (step 4: the rpc ticks the step and logs the payment on Budget in one step). */
export async function writeFunds(actions: AwActions, awardId: string, ms = AW_WRITE_MS): Promise<FundsResult> {
  const r = await withTimeout(actions.setStepDone(awardId, 4, true), ms);
  if (r.kind !== 'answer') return { kind: 'unknown' };
  const o = fundsOutcome(r.value);
  if (o.kind === 'saved') return { kind: 'saved' };
  if (o.kind === 'already') return { kind: 'already' };
  return { kind: 'refused', message: o.message || "Couldn't save. Try again." };
}

/** Records that a reminder about the acceptance form went out (step 2's reminder date). Nothing is emailed. */
export async function writeReminder(actions: AwActions, awardId: string, ms = AW_WRITE_MS): Promise<boolean> {
  const r = await withTimeout(actions.sendReminder(awardId, 2), ms);
  return r.kind === 'answer' && r.value.ok === true;
}

'use client';

// The Board members page's live writes, called from the board (components/people/people-board.tsx). Mock mode never calls
// these. Two writes exist:
// - Give or remove admin rights: the server action changeRoleAction (lib/people-actions.ts), which re-reads the caller's role
//   from the auth server, requires admin rights, refuses a change to the caller's own role and allows only 'admin' or
//   'board'. Setting the same role twice is harmless, so a repeat after a timeout is safe.
// - A nudge: a direct message in Board chat through the batch-1 chat writers (open the direct conversation, then post with a
//   browser-made id). A retry of the SAME words to the same person within two minutes reuses the id, so a send that saved
//   before its answer was lost is not posted twice (the database's duplicate-id refusal counts as saved).
import { openDirect, postMessage, sendBudget } from '@/lib/chat-actions';
import { changeRoleAction } from '@/lib/people-actions';
import type { StaffRole } from '@/lib/role';
import { retryIds } from '@/lib/tasks-ids';

/** Every live call gives up after 15 seconds. */
export const LIMIT_MS = 15_000;

/**
 * What a role change came back with. `unknown`: no answer within the time limit, so the change may or may not have been
 * made (the board says "No answer in time. Reload to check."). A rejection or network error is a plain failure.
 */
export type RoleResult = { ok: true } | { ok: false; reason: string; unknown?: boolean };

/** The words when the call itself failed (a network error or a thrown error). */
export const ROLE_FAILED = "Couldn't save. Try again.";
/** The words when no answer came in time. */
export const ROLE_TIMEOUT = 'No answer in time. Reload to check.';

// Resolves with `p`'s value, `failed` when it rejects, or `late` after LIMIT_MS when neither happened yet.
function within<T>(p: Promise<T>, late: T, failed: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(late), LIMIT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(failed);
      },
    );
  });
}

/** Gives (`to` = 'admin') or removes (`to` = 'board') admin rights through the server action, within 15 seconds. */
export async function changeRoleLive(userId: string, to: StaffRole): Promise<RoleResult> {
  return within<RoleResult>(changeRoleAction(userId, to), { ok: false, reason: ROLE_TIMEOUT, unknown: true }, { ok: false, reason: ROLE_FAILED });
}

/** The retry memory for nudges (one per tab). */
const nudgeIds = retryIds();

/** The retry key of a nudge: the same sender, person and words. */
export const nudgeKey = (me: string, to: string, body: string) => `${me}|${to}|${body}`;

/**
 * Sends a nudge as a direct message to `to` from the signed-in person `me`. Resolves with the saved message's time; throws
 * when it did not save (the board keeps the words on screen with Retry).
 */
export async function sendNudgeLive(me: string, to: string, body: string): Promise<{ createdAt: string }> {
  const key = nudgeKey(me, to, body);
  const id = nudgeIds.take(key, Date.now());
  // One 15-second budget for the whole send (open the conversation, insert, read back).
  const signal = sendBudget();
  try {
    const channel = await openDirect(to, signal);
    const saved = await postMessage(channel, body, { id, signal });
    nudgeIds.done(key);
    return { createdAt: saved.createdAt };
  } catch (e) {
    nudgeIds.fail(key, id, Date.now());
    throw e;
  }
}

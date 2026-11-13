'use client';

// The refreshed Interviews page's live calls, made from the board (components/interviews/interviews-board.tsx). Mock mode
// never calls these. Each one calls an existing server action in lib/actions/interviews.ts unchanged, with the same
// arguments the old page passed; nothing here adds a meeting, an email or a message of its own. Every call has a time
// limit; when the answer does not come in time the page says "No answer in time. Reload to check." (plus "Some emails or
// meetings may already have gone out." for a call that sends) and claims nothing, because the action may still have
// finished on the server. Nothing is retried automatically.
// The gate (createGate) lets one call run at a time and, after any live write, keeps every write control locked until
// the page's data has been read again (a fresh view from router.refresh), so a timeout never leads to a quick resend.
import {
  addProposedTime,
  makeTeamsLinksAction,
  previewPairing,
  previewRebalanceAction,
  previewTeamsLinksAction,
  rebalanceAction,
  rebuildTimes,
  remindBoard,
  remindStudentsAction,
  removeProposedTime,
  rerunPairing,
  saveVideoLinks,
  sendTimes,
  type PairingPreview,
  type RebalancePreview,
  type TeamsPreview,
} from '@/lib/actions/interviews';
import { lateText, NO_ANSWER } from '@/lib/interviews-map';

export { NO_ANSWER };

/** Quick calls (a check or one row) give up after 15 seconds. */
export const LIMIT_MS = 15_000;
/** Calls that send email give up after a minute. */
export const MAIL_MS = 60_000;
/** "Make Teams links" and "Send times" may take minutes (the route allows 300 seconds). */
export const LONG_MS = 300_000;

/** What a call came back with: the server's answer, a refusal with its reason, or no answer in time. */
export type Answer<T> = { kind: 'ok'; value: T } | { kind: 'refused'; message: string } | { kind: 'late' };

/** Waits for `p` for at most `ms`. A thrown call (the network dropped) counts as no answer: it may still have run. */
export function settle<T extends { ok: boolean; message: string }>(p: Promise<T>, ms: number): Promise<Answer<T>> {
  return new Promise((resolve) => {
    const t = globalThis.setTimeout(() => resolve({ kind: 'late' }), ms);
    p.then(
      (v) => {
        globalThis.clearTimeout(t);
        resolve(v.ok ? { kind: 'ok', value: v } : { kind: 'refused', message: v.message || "That didn't save. Try again." });
      },
      () => {
        globalThis.clearTimeout(t);
        resolve({ kind: 'late' });
      },
    );
  });
}

/** The gate's state: the key of the call in flight (null when none), and whether a write's result still waits for fresh data. */
export type GateState = { busy: string | null; stale: boolean };

/** What a call through the gate came to: the answer, a failure with the words to show, or 'locked' (nothing was called). */
export type GateResult<T> = { kind: 'ok'; value: T } | { kind: 'fail'; message: string } | { kind: 'locked' };

/** How a call goes through the gate: `write` (changes data: locks until fresh data lands) and `sends` (emails or meetings). */
export type CallKind = { write: boolean; sends: boolean };

/**
 * One gate per board. `run` calls at most one thing at a time (a second press while one runs, or before fresh data has
 * landed after a write, calls nothing and returns 'locked'); after a write, whatever came back, it stays locked until
 * `landed()` (the board calls it when a new view arrives). `hold`/`release` mark mock-mode work as busy.
 * `onChange` gets each new state (the board redraws from it).
 */
export function createGate(onChange: (s: GateState) => void) {
  let s: GateState = { busy: null, stale: false };
  const set = (p: Partial<GateState>) => {
    s = { ...s, ...p };
    onChange(s);
  };
  return {
    state: () => s,
    locked: () => s.busy !== null || s.stale,
    /** Fresh data arrived: writes may run again. */
    landed: () => {
      if (s.stale) set({ stale: false });
    },
    hold: (key: string) => set({ busy: key }),
    release: () => set({ busy: null }),
    async run<T>(key: string, call: () => Promise<Answer<T>>, kind: CallKind): Promise<GateResult<T>> {
      if (s.busy !== null || s.stale) return { kind: 'locked' };
      set({ busy: key });
      const a = await call();
      set({ busy: null, stale: kind.write ? true : s.stale });
      if (a.kind === 'ok') return a;
      return { kind: 'fail', message: a.kind === 'late' ? lateText(kind.sends) : a.message };
    },
  };
}

/** The board's gate. */
export type Gate = ReturnType<typeof createGate>;

/** What "Make Teams links" would do (changes nothing). */
export const previewLinksLive = (): Promise<Answer<TeamsPreview>> => settle(previewTeamsLinksAction(), LIMIT_MS);

/** "Make Teams links": Teams meetings from meetings@ and the emails, by the existing action. */
export const makeLinksLive = () => settle(makeTeamsLinksAction(), LONG_MS);

/** Saves one interview's Teams link (the existing action emails the student and both interviewers). */
export const saveLinkLive = (slotId: string, url: string) => settle(saveVideoLinks([{ slotId, url }]), MAIL_MS);

/** "Rebuild from availability". */
export const rebuildLive = (cycleId: string) => settle(rebuildTimes(cycleId), MAIL_MS);

/** Adds one time ("2026-11-10", "18:30"); `openNow` when the times are already open to students, as the old page did. */
export const addTimeLive = (cycleId: string, day: string, time: string, openNow: boolean) => settle(addProposedTime(cycleId, day, time, openNow), LIMIT_MS);

/** Removes an open time nobody holds. */
export const removeTimeLive = (slotId: string) => settle(removeProposedTime(slotId), LIMIT_MS);

/** Opens the times in the Portal and emails applicants to book. */
export const sendTimesLive = (cycleId: string) => settle(sendTimes(cycleId), LONG_MS);

/** Emails board members who have not sent their free hours. */
export const remindBoardLive = (cycleId: string) => settle(remindBoard(cycleId), MAIL_MS);

/** Emails students who have not booked (one, or all with `ids` null) the booking email again; once a day each. */
export const remindStudentsLive = (cycleId: string, ids: string[] | null) => settle(remindStudentsAction(cycleId, ids), ids && ids.length === 1 ? MAIL_MS : LONG_MS);

/** What a rebalance would move (changes nothing). */
export const previewRebalanceLive = (cycleId: string): Promise<Answer<RebalancePreview>> => settle(previewRebalanceAction(cycleId), LIMIT_MS);

/** Moves the interviews the preview listed (the existing action emails the people affected). */
export const rebalanceLive = (cycleId: string) => settle(rebalanceAction(cycleId), MAIL_MS);

/** What re-running pairing would do (changes nothing). */
export const previewPairingLive = (): Promise<Answer<PairingPreview>> => settle(previewPairing(), LIMIT_MS);

/** Pairs the booked interviews that have no pair (the existing action sends no email). */
export const rerunPairingLive = () => settle(rerunPairing(), MAIL_MS);

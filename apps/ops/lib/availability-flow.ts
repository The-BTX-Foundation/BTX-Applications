// Interviews > Your availability: the pure parts of Send and the typed-line reader (no React). Send calls the existing
// saveAvailability action exactly as the current page does (the whole draft, send: true); the reader calls the existing
// readTypedAvailability action with the typed words only. Neither action is changed or wrapped server side: the board
// passes them in, and these helpers only add a 15-second limit in the browser and turn the answer into the page's words.
// saveAvailability is multi-step and not one transaction, so after any failure the page re-reads the saved state.
import { mergeRanges, toRange, type MinuteRange, type Range } from './free-ranges';
import { easternDay } from './refresh-time';

/** How long Send or the reader may take before the page stops waiting. */
export const AV_WRITE_MS = 15_000;
/** After an unanswered send, a second re-read this much later catches a save that landed late. */
export const AV_RECHECK_MS = 15_000;
/** A refused or failed send. */
export const SAVE_ERR = "Couldn't save. Try again.";
/**
 * No answer in time: the save may have gone through, so the page re-reads and says what it found. (Deviation from the
 * house line "No answer in time. Reload to check.": a reload would throw away the unsent draft, which lives only here.)
 */
export const NO_ANSWER = 'No answer in time. Your times are kept here while the page checks what was saved.';
/** The reader gave no answer in time. */
export const READ_SLOW = "That took too long. Try again, or add the times by hand.";

/** The existing save action's input and answer (lib/actions/availability.ts, unchanged). */
export type SaveInput = { ranges: Range[]; maxInterviews: number | null; text: string; conflicts: string[]; send: boolean; /** The interviews the person agreed to come off (checkAvailabilityCover). */ confirmOff?: string[] };
/** One line about an interview the save took the person off: who covers it now, or that nobody could yet. */
export type CoverLine = { text: string; ok: boolean };
export type SaveAnswer = { ok: true; ranges: Range[]; sentAt: string | null; summary: string[]; cover?: CoverLine[] } | { ok: false; message: string };
/** The existing reader action's answer (lib/actions/availability.ts, unchanged). */
export type ReadAnswer = { ok: true; ranges: Range[]; unread: string[] } | { ok: false; reason: string; message: string };

/** What the page does with a send: saved (the server's cleaned ranges and sent time), refused, or unknown (no answer). */
export type SendOutcome = { kind: 'ok'; ranges: Range[]; sentAt: string | null; cover: CoverLine[] } | { kind: 'refused'; message: string } | { kind: 'unknown'; message: string };

// Resolves to `fallback` when `p` takes longer than `ms` (the promise itself keeps running; its late answer is ignored).
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((res) => {
    const t = setTimeout(() => res(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      () => {
        clearTimeout(t);
        res(fallback);
      },
    );
  });
}

/** The save input for a draft: every range, the limit, the note, the names, and `send: true` (the current page's call). */
export function sendInput(ranges: MinuteRange[], maxInterviews: number | null, text: string, conflicts: string[]): SaveInput {
  return { ranges: ranges.map(toRange), maxInterviews, text, conflicts, send: true };
}

/**
 * Sends through `save` (the existing action) with a 15-second limit. A refusal keeps the action's own message (its
 * validation words are plain); a thrown call says "Couldn't save. Try again."; no answer in time says NO_ANSWER (the save may
 * have gone through; the page re-reads).
 */
export async function runSend(save: (i: SaveInput) => Promise<SaveAnswer>, input: SaveInput, ms = AV_WRITE_MS): Promise<SendOutcome> {
  const TIMEOUT = Symbol('timeout');
  const THREW = Symbol('threw');
  const r = await within<SaveAnswer | typeof TIMEOUT | typeof THREW>(
    save(input).catch(() => THREW),
    ms,
    TIMEOUT,
  );
  if (r === TIMEOUT) return { kind: 'unknown', message: NO_ANSWER };
  if (r === THREW) return { kind: 'refused', message: SAVE_ERR };
  if (!r.ok) return { kind: 'refused', message: r.message || SAVE_ERR };
  return { kind: 'ok', ranges: r.ranges, sentAt: r.sentAt, cover: r.cover ?? [] };
}

/** Reads typed words through `read` (the existing action) with a 15-second limit; a throw or no answer is a plain failure. */
export async function runRead(read: (text: string) => Promise<ReadAnswer>, text: string, ms = AV_WRITE_MS): Promise<ReadAnswer> {
  return within<ReadAnswer>(
    read(text).catch(() => ({ ok: false, reason: 'failed', message: READ_SLOW })),
    ms,
    { ok: false, reason: 'failed', message: READ_SLOW },
  );
}

/**
 * After a failed or unanswered send, the page re-reads the saved state. When the server now holds exactly the draft and
 * a newer sent time than before the send, the send did go through: the error and the "not sent" list clear.
 */
export function sendLanded(serverSig: string, draftSig: string, sentBefore: string | null, sentNow: string | null): boolean {
  if (serverSig !== draftSig || !sentNow) return false;
  return !sentBefore || Date.parse(sentNow) > Date.parse(sentBefore);
}

/** Today's Eastern day for a submit: re-read from the clock live; mock keeps the sample's day. */
export function submitDay(live: boolean, today: string, now: Date = new Date()): string {
  return live ? easternDay(now.toISOString()) : today;
}

// ---- interviews a send would take the person off ---------------------------------------------------------------------

/** One interview the new free times no longer cover: its slot and "Ada Okafor, Thu Nov 12, 5:30 PM". */
export type CoverItem = { slotId: string; line: string };
export type CoverCheck = { ok: true; off: CoverItem[] } | { ok: false; message: string };
/** The check gave no answer in time, or failed. Nothing was sent. */
export const COVER_CHECK_ERR = "Couldn't check your interviews. Nothing was sent. Try again.";

/** Asks `check` (checkAvailabilityCover) which interviews the ranges would take the person off, with a 15-second limit. */
export async function runCoverCheck(check: (i: { ranges: Range[] }) => Promise<CoverCheck>, ranges: Range[], ms = AV_WRITE_MS): Promise<CoverCheck> {
  const fail: CoverCheck = { ok: false, message: COVER_CHECK_ERR };
  const r = await within<CoverCheck>(check({ ranges }).catch(() => fail), ms, fail);
  return r.ok ? r : { ok: false, message: r.message || COVER_CHECK_ERR };
}

/** "This removes you from 2 interviews: ... We'll find cover." */
export function coverAsk(off: CoverItem[]): string {
  const n = off.length;
  return `This removes you from ${n} ${n === 1 ? 'interview' : 'interviews'}. We'll find cover.`;
}

/**
 * Mock only: the booked half hours (30 minutes from `min`) the new free times no longer cover, in the sample's words.
 * Live asks the server instead.
 */
export function mockOff(bookings: { id: string; day: string; min: number; applicant: string }[], ranges: MinuteRange[], label: (day: string, min: number) => string): CoverItem[] {
  const merged = mergeRanges(ranges);
  return bookings
    .filter((b) => !merged.some((r) => r.day === b.day && r.startMin <= b.min && r.endMin >= b.min + 30))
    .map((b) => ({ slotId: b.id, line: `${b.applicant}, ${label(b.day, b.min)}` }));
}

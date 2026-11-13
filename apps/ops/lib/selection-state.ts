// The Selection board's small state rules, kept pure so tests/selection-state.test.ts can check the paths a static
// render can't reach: what a re-read after a failed release means, when that re-read is fresh enough to trust, where focus
// goes after a write or Escape, what a failed write says, the lines under "Released", and the two-main-awards guard.
import type { EmailOutcome } from './release-copy';
import { NO_ANSWER, SAVE_ERR } from './selection-map';
import type { SlAward } from './selection-view';

/** Where the release stands on this page (see components/selection/selection-board.tsx). */
export type RelState = 'idle' | 'confirm' | 'running' | 'checking' | 'was-released' | 'not-released' | 'check-failed';

/** What a record or undo returned (components/selection/selection-writes.ts WriteResult). */
export type SlWrite = { kind: 'saved'; id: string | null } | { kind: 'refused'; message: string } | { kind: 'failed' } | { kind: 'unknown' };

/** What the re-read after a failed or unanswered release says happened. */
export function relAfterReread(v: { loadFailed: boolean; releasedAt: string | null }): 'check-failed' | 'was-released' | 'not-released' {
  if (v.loadFailed) return 'check-failed';
  return v.releasedAt ? 'was-released' : 'not-released';
}

/**
 * Whether the page may settle a "checking" release from the current data: nothing running, and the data was read after
 * the attempt began (the server's `now` changed), so an old view never says "not released".
 */
export function canSettleCheck(i: { rel: RelState; idle: boolean; from: string | null; now: string }): boolean {
  return i.rel === 'checking' && i.idle && i.from != null && i.now !== i.from;
}

/** The words for a record or undo that did not save. */
export function failText(r: SlWrite): string {
  if (r.kind === 'refused') return r.message || SAVE_ERR;
  return r.kind === 'unknown' ? NO_ANSWER : SAVE_ERR;
}

/** Where focus goes after a record: Undo of the new award, or the error line. */
export function focusAfterRecord(kind: 'main' | 'extra', r: SlWrite): string {
  if (r.kind !== 'saved') return 'recErr';
  return kind === 'main' ? 'undoMain' : `undoX-${r.id ?? ''}`;
}

/** The control a confirm returns focus to when it closes (Back or Escape). */
export function confirmOpener(which: 'main' | 'extra' | 'release'): string {
  return which === 'main' ? 'recordMain' : which === 'extra' ? 'recordX' : 'release';
}

/** Shown beside the emails line when the emails "failed" after the release: some may have gone out. */
export const PARTIAL_EMAILS = "Decisions are released. We could not confirm that every email went out: some may have. Don't release again.";

/** Shown when a release never answered but the re-read shows decisions are out. */
export const UNCONFIRMED_EMAILS = "Couldn't confirm the emails went out. Reload the page to see the current state. Don't release again.";

/** The lines under "Released ...": the emails line (from lib/release-copy.ts) and, where needed, a plain warning. */
export function releasedLines(i: { emailLine: string | null; emails: EmailOutcome | null; rel: RelState }): string[] {
  if (i.emails && i.emailLine) return i.emails.state === 'failed' ? [i.emailLine, PARTIAL_EMAILS] : [i.emailLine];
  if (i.rel === 'was-released') return [UNCONFIRMED_EMAILS];
  return ['Each student sees the result in the Portal.'];
}

/** The one line for a release that did not happen (the reason, when the server gave one, without its own "Try again"). */
export function notReleasedLine(reason: string): string {
  const r = reason.replace(/\s*Try again\.?\s*$/i, '').trim();
  const lead = r ? `${/[.!?]$/.test(r) ? r : `${r}.`} ` : '';
  return `${lead}Decisions weren't released, so no emails went out. Reload the page before trying again.`;
}

/** Two or more main awards (a race the server does not stop): the warning, or null when there is at most one. */
export function twoMainsWarning(awards: SlAward[]): string | null {
  return awards.filter((a) => a.kind === 'main').length > 1 ? 'Two main awards are recorded. Ask an admin to remove one before releasing.' : null;
}

/** The meeting row to show: the next one that has not started, else the most recent past one (rows: starts_at). */
export function pickMeeting<T extends { starts_at?: unknown }>(rows: T[], nowIso: string): T | undefined {
  const at = (r: T) => (typeof r.starts_at === 'string' ? Date.parse(r.starts_at) : NaN);
  const now = Date.parse(nowIso);
  const ok = rows.filter((r) => !Number.isNaN(at(r)));
  const next = ok.filter((r) => at(r) >= now).sort((a, b) => at(a) - at(b))[0];
  return next ?? ok.filter((r) => at(r) < now).sort((a, b) => at(b) - at(a))[0];
}

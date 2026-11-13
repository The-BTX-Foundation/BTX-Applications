// The "Log a sponsorship" flow without React (unit-tested in tests/sponsorships-log.test.ts), used by
// components/sponsorships/sponsorships-board.tsx in both modes (live: lib/sponsorships-writes.ts; mock: the page's own rows).
//
// rpc log_sponsorship takes no id from the browser, so a log whose answer never came back may still have saved. Each such
// log is kept as an UNRESOLVED ATTEMPT (its input and the ids of matching rows read just before it) for as long as the page
// is open; the key ignores case and extra spaces in the title, so retyping the line cannot slip past it. Closing the add
// line, Change, Cancel and Escape keep it. A read that shows a new matching row (the check, or fresh server rows) records it
// as SAVED, with the stored row; that memory ends when the page shows the saved row ("That one is already in the list"),
// after which the next deliberate Log sends. A definite refusal never hides a saved row, and a missing memory never reads
// as "didn't save". Memory lasts for one page open (not across tabs or a reload).
// This narrows the double-log risk with a read-back check; it does not remove it (a request still queued on the server past
// the time limit and the 2-second wait can still commit later). A database-side id (p_id on log_sponsorship) would remove
// it; that is a separate, gated migration (B27).
import { verdict, type LogInput } from './sponsorships-map';
import type { SponsorRow } from './sponsorships-view';
import type { LogResult } from './sponsorships-writes';

/** The calls one log needs. `match` reads the stored rows with the same title, amount and date (null = the read failed). */
export type LogDeps = {
  match: (p: LogInput) => Promise<SponsorRow[] | null>;
  log: (p: LogInput) => Promise<LogResult>;
  wait: (ms: number) => Promise<void>;
  checkWait: number;
};

/** What the page shows after a log or a check. `earlier` = an earlier attempt saved; `row` = that row as stored. */
export type LogOutcome =
  | { kind: 'logged'; id: string; earlier: false }
  | { kind: 'logged'; id: string; earlier: true; row: SponsorRow | null }
  | { kind: 'not_saved' }
  | { kind: 'unknown' }
  | { kind: 'refused'; reason: 'no_category' | 'denied' | 'invalid' }
  | { kind: 'failed' };

/** A row as the settle step reads it. */
export type SeenRow = { id: string; title: string; cents: number; on: string | null };

/** The key an attempt is remembered by: the title (case and spacing ignored), the exact amount in cents and the exact date. */
export const attemptKey = (p: { title: string; cents: number; on: string | null }) =>
  `${p.title.trim().replace(/\s+/g, ' ').toLowerCase()}\u0000${p.cents}\u0000${p.on ?? ''}`;

type Attempt = { before: string[]; p: LogInput };
type Saved = { id: string; row: SponsorRow | null };

const idsOf = (rows: SponsorRow[] | null) => (rows ? rows.map((r) => r.id) : null);

/** One page's logger: the unresolved attempts, the attempts seen as saved, and the two actions. */
export function createLogger(deps: LogDeps) {
  const open = new Map<string, Attempt>();
  const saved = new Map<string, Saved>();

  // The page is about to show this line as saved: both memories of it end here.
  const done = (key: string, id: string): LogOutcome => {
    open.delete(key);
    saved.delete(key);
    return { kind: 'logged', id, earlier: false };
  };
  const earlier = (key: string, s: Saved): LogOutcome => {
    open.delete(key);
    saved.delete(key);
    return { kind: 'logged', id: s.id, earlier: true, row: s.row };
  };
  const rowIn = (rows: SponsorRow[] | null, id: string) => rows?.find((r) => r.id === id) ?? null;

  // Reads the matching rows after a failed log, waiting first so a request still finishing on the server is seen. A settle
  // that lands meanwhile is the answer; with no memory of the attempt the answer is "couldn't check", never "didn't save".
  async function checkAfter(key: string, onCheck?: () => void): Promise<LogOutcome> {
    onCheck?.();
    await deps.wait(deps.checkWait);
    const s1 = saved.get(key);
    if (s1) return earlier(key, s1);
    const a = open.get(key);
    if (!a) return { kind: 'unknown' };
    const after = await deps.match(a.p);
    const s2 = saved.get(key);
    if (s2) return earlier(key, s2);
    const v = verdict(a.before, idsOf(after));
    if (v.state === 'saved') return done(key, v.id);
    return v.state === 'not_saved' ? { kind: 'not_saved' } : { kind: 'unknown' };
  }

  return {
    /** True while a log of this line has no settled outcome, or one the page has not shown yet. */
    isOpen: (p: LogInput) => open.has(attemptKey(p)) || saved.has(attemptKey(p)),

    /**
     * Logs a line at most once. A line already seen as saved comes back as saved earlier (no rpc). Then a fresh read: if an
     * earlier unresolved attempt of the same line now shows a new matching row, that row is the saved log (no rpc). A failed
     * read sends nothing. Otherwise the rpc runs once; a definite refusal is reported as such (unless the line is meanwhile
     * seen as saved), and any other failure is checked by reading again (never resent); `onCheck` is called as it starts.
     */
    async logOnce(p: LogInput, onCheck?: () => void): Promise<LogOutcome> {
      const key = attemptKey(p);
      const s0 = saved.get(key);
      if (s0) return earlier(key, s0);
      const prev = open.get(key);
      // The earlier attempt is read with its own words (its stored title may differ in case or spacing).
      const prevRows = prev ? await deps.match(prev.p) : null;
      const s1 = saved.get(key);
      if (s1) return earlier(key, s1);
      if (prev && prevRows) {
        const v = verdict(prev.before, idsOf(prevRows));
        if (v.state === 'saved') return earlier(key, { id: v.id, row: rowIn(prevRows, v.id) });
      }
      const base = prev && prev.p.title === p.title ? prevRows : await deps.match(p);
      if (base === null) return { kind: 'failed' };
      const s2 = saved.get(key);
      if (s2) return earlier(key, s2);
      open.set(key, { before: base.map((r) => r.id), p });
      const r = await deps.log(p);
      if (r.ok) return done(key, r.id);
      if (r.reason !== 'maybe') {
        const s3 = saved.get(key);
        if (s3) return earlier(key, s3);
        open.delete(key);
        return { kind: 'refused', reason: r.reason };
      }
      return checkAfter(key, onCheck);
    },

    /** "Check again" after a check that could not read. Never "didn't save" without a before-and-after comparison. */
    async recheck(p: LogInput): Promise<LogOutcome> {
      const key = attemptKey(p);
      const s = saved.get(key);
      if (s) return earlier(key, s);
      if (!open.has(key)) return { kind: 'unknown' };
      return checkAfter(key);
    },

    /** Fresh rows from the server: an attempt whose line now shows a new matching row is recorded as saved (not forgotten). */
    settleWith(rows: (SeenRow & Partial<SponsorRow>)[]) {
      for (const [key, a] of open) {
        const seen = new Set(a.before);
        const row = rows.find((r) => attemptKey(r) === key && !seen.has(r.id));
        if (row) {
          saved.set(key, { id: row.id, row: 'kind' in row && row.kind ? (row as SponsorRow) : null });
          open.delete(key);
        }
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

/** The confirm's gold button only takes a click 400 ms after it appears and after a fresh key-up or pointer press. */
export const ARM_MS = 400;

/** True when the confirm's gold button may act: long enough since it appeared, and a key was let go (or a pointer pressed). */
export function isArmed(openedAt: number, now: number, freshUp: boolean): boolean {
  return freshUp && now - openedAt >= ARM_MS;
}

/**
 * Runs one log or check while nothing else runs: null when one is already running; a rejection becomes "couldn't check";
 * `busy` is always reset, so Change, Cancel and Escape never stay locked.
 */
export async function guarded(busy: { current: boolean }, run: () => Promise<LogOutcome>): Promise<LogOutcome | null> {
  if (busy.current) return null;
  busy.current = true;
  try {
    return await run();
  } catch {
    return { kind: 'unknown' };
  } finally {
    busy.current = false;
  }
}

// The Sponsorships page's one live write, called from the browser (components/sponsorships/sponsorships-board.tsx).
// "Log a sponsorship" is ONE database function, public.log_sponsorship(), which saves the sponsorship AND its spending entry
// under that year's Sponsorships budget line in one transaction, as the signed-in person (row-level security applies).
//
// The function takes no id from the browser, so a request that times out may still have saved, and a blind resend would log
// the money twice. So the page never resends after a failure: it reads the ids of rows with the same title, amount and date
// before the log (`matchingRows`) and again after a failure, and only a read that shows no new row allows "Try again"
// (lib/sponsorships-log.ts). That read-back check narrows the double-log risk; it does not remove it: a request still queued
// on the server past the 15-second limit and the 2-second wait can commit after the check. Only a database-side id would
// remove it. Every call gives up after 15 seconds. The client is passed in so tests can stand in.
import { getBrowserClient } from '@btx/data';
import { mapRows, type LogInput, type Row } from './sponsorships-map';
import { SPONSOR_COLS } from './sponsorships-live';
import type { SponsorRow } from './sponsorships-view';

type Res<T> = { data: T; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => PromiseLike<T> };
type Match = { eq: (c: string, v: unknown) => Match; order: (c: string, o: { ascending: boolean }) => Match; limit: (n: number) => Abortable<Res<Record<string, unknown>[] | null>> };

/** The parts of the browser client these calls use. */
export type WriteClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Abortable<Res<unknown>>;
  from: (t: string) => { select: (c: string) => Match };
};

/** The signed-in person's browser client, typed loosely (the Ops Hub tables are not in the generated types). */
export const browserWriteClient = () => getBrowserClient() as unknown as WriteClient;

/** One request's time limit. */
export const WRITE_MS = 15_000;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(WRITE_MS);

/** Rows with the same title, amount and date are few; more than this many is treated as a failed read. */
const MATCH_CAP = 500;

/**
 * The rows that look exactly like this log (same title, amount in cents and spending date), with their stored values, or
 * null when the read fails (or hits the cap): the caller then cannot tell whether a log saved, and says so.
 */
export async function matchingRows(p: LogInput, client?: WriteClient): Promise<SponsorRow[] | null> {
  try {
    const c = client ?? browserWriteClient();
    const { data, error } = await c
      .from('sponsorships')
      .select(SPONSOR_COLS)
      .eq('title', p.title)
      .eq('amount_cents', p.cents)
      .eq('occurred_on', p.on)
      .order('id', { ascending: true })
      .limit(MATCH_CAP)
      .abortSignal(limit());
    if (error || !Array.isArray(data) || data.length >= MATCH_CAP) return null;
    return mapRows(data as Row[], Number(p.on.slice(0, 4)));
  } catch {
    return null;
  }
}

/**
 * What one log call came back with: the new row's id; a definite refusal the database answered with (nothing saved):
 * `no_category` (no Sponsorships budget line that year), `denied` (row-level security or no permission), `invalid` (a value
 * the table refuses); or `maybe`, a failure that may have saved (a timeout, a lost connection, anything else).
 */
export type LogResult = { ok: true; id: string } | { ok: false; reason: 'no_category' | 'denied' | 'invalid' | 'maybe' };

// A database error's Postgres code and message.
type DbError = { code?: string; message?: string };

/** The refusal a database error stands for, or `maybe` when it is not a definite answer from the database. Pure. */
export function refusalOf(error: unknown): 'no_category' | 'denied' | 'invalid' | 'maybe' {
  const e = (error ?? {}) as DbError;
  const msg = String(e.message ?? '');
  const code = String(e.code ?? '');
  if (msg.includes('no_sponsorship_category')) return 'no_category';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'denied';
  // 22xxx = bad data (out of range, bad date); 23xxx = a table rule (check, not null, foreign key).
  if (/^2[23][0-9A-Z]{3}$/.test(code)) return 'invalid';
  return 'maybe';
}

/**
 * Calls log_sponsorship once. A refusal the database answered with is definite: nothing was saved. Every other failure, a
 * timeout included, is `maybe`: the caller must check before allowing another try.
 */
export async function logSponsorshipOnce(p: LogInput, client?: WriteClient): Promise<LogResult> {
  try {
    const c = client ?? browserWriteClient();
    const { data, error } = await c
      .rpc('log_sponsorship', { p_title: p.title, p_kind: p.kind, p_students: p.students, p_amount_cents: p.cents, p_when_label: p.when, p_spent_on: p.on })
      .abortSignal(limit());
    if (error) return { ok: false, reason: refusalOf(error) };
    if (typeof data !== 'string' || !data) return { ok: false, reason: 'maybe' };
    return { ok: true, id: data };
  } catch {
    return { ok: false, reason: 'maybe' };
  }
}

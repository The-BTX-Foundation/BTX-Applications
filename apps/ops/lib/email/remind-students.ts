// "Remind" on the Interviews page: emails applicants who have not booked an interview time the "Schedule your interview"
// email again (the same email "Send times" sends: lib/email/send.ts sendBookingInvites), with the Portal link to book.
// SERVER ONLY and ADMIN ONLY: it checks the caller is an admin, then reads addresses with the service role.
//
// Who: submitted applicants of the cycle with no active booking (the same rule as sendBookingInvites), all of them or the
// ones named. At most one reminder per student per Eastern day: each send reserves an email_log row first (kind
// 'book-reminder', recipient "<email>|<Eastern date>", migration 20261113120100_book_reminder.sql), so a second press the
// same day, or two admins at once, sends nothing more. A failed send gives the row back. Until that migration is applied
// the database refuses the kind and nothing is sent ("not-ready"). Without RESEND_API_KEY or OPS_EMAIL_FROM nothing is
// sent or logged. It refuses a cycle that is not the current published one, and one whose interview end date has passed
// (Eastern), so an old cycle's students are never reminded.
import { bookHtml, bookSubject, bookText, emailDay, sendMail, type Mail, type SendResult } from '@btx/emails';
import { easternDate, remindKey } from '../interview-cover';
import { defaultIsAdmin, HELP_EMAIL } from './send';

const DEFAULT_PORTAL_URL = 'https://apply.thebtxfoundation.org';

export type RemindRow = { kind: 'book-reminder'; cycle_id: string; application_id: string; slot_id: null; recipient: string; to_address: string };
export type Applicant = { id: string; full_name: string | null; terpmail: string; applicant_code: string | null };

/** What the reminder reads and writes; the default uses the service role, tests pass their own. */
export interface RemindStore {
  cycle(cycleId: string): Promise<{ term: string; award_name: string | null; interview_end: string | null } | null>;
  /** The id of the current published cycle (the newest with status 'published'), or null when there is none. */
  publishedCycleId(): Promise<string | null>;
  submittedApplicants(cycleId: string): Promise<Applicant[]>;
  bookedApplicationIds(cycleId: string): Promise<Set<string>>;
  /** Reserves the row: its id, false when already taken today, 'not-ready' when the database does not know the kind yet. */
  claim(row: RemindRow): Promise<string | false | 'not-ready'>;
  setResendId(id: string, resendId: string | null): Promise<void>;
  release(id: string): Promise<void>;
}

export type RemindDeps = {
  store?: RemindStore;
  isAdmin?: () => Promise<boolean>;
  send?: (mail: Mail, from: string | undefined) => Promise<SendResult>;
  now?: () => Date;
  pauseMs?: number;
  portalUrl?: string;
  from?: string;
};

export type RemindResult =
  | { ok: true; sent: number; skipped: number; failed: number; notConfigured: boolean; at: string }
  | { ok: false; reason: 'not-admin' | 'no-service-key' | 'no-cycle' | 'not-current' | 'no-interview-end' | 'interviews-over' | 'not-ready' | 'none' };

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const firstName = (a: Applicant) => (a.full_name ?? '').trim().split(/\s+/)[0] || 'there';

async function defaultStore(): Promise<RemindStore | null> {
  const { createServiceClient } = await import('@btx/data/server');
  const db = createServiceClient();
  if (!db) return null;
  const { supabaseStore } = await import('./store');
  const base = supabaseStore(db);
  return {
    cycle: base.cycle,
    async publishedCycleId() {
      const { data, error } = await db.from('cycles').select('id').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`published cycle: ${error.message}`);
      return (data as { id: string } | null)?.id ?? null;
    },
    submittedApplicants: base.submittedApplicants,
    bookedApplicationIds: base.bookedApplicationIds,
    async claim(row) {
      const { data, error } = await db.from('email_log').insert(row).select('id').single();
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '23505') return false; // already reminded today
        if (code === '23514') return 'not-ready'; // the kind check: migration 20261113120100 not applied yet
        throw new Error(`email log claim: ${error.message}`);
      }
      return (data as { id: string }).id;
    },
    setResendId: base.setResendId,
    release: base.release,
  };
}

/**
 * Reminds the applicants of `cycleId` who have not booked: everyone (`ids` null) or the ones whose application ids are
 * listed (an id that has booked since, or is not an applicant, is left out). Returns what was sent.
 */
export async function remindUnbooked(cycleId: string, ids: string[] | null, deps: RemindDeps = {}): Promise<RemindResult> {
  if (!(await (deps.isAdmin ?? defaultIsAdmin)())) return { ok: false, reason: 'not-admin' };
  const store = deps.store ?? (await defaultStore());
  if (!store) return { ok: false, reason: 'no-service-key' };
  const cycle = await store.cycle(cycleId);
  if (!cycle) return { ok: false, reason: 'no-cycle' };
  if ((await store.publishedCycleId()) !== cycleId) return { ok: false, reason: 'not-current' };
  if (!cycle.interview_end) return { ok: false, reason: 'no-interview-end' };
  const now = (deps.now ?? (() => new Date()))();
  // interview_end is a date ("2026-11-20"); the last interview day still counts.
  if (cycle.interview_end.slice(0, 10) < easternDate(now)) return { ok: false, reason: 'interviews-over' };
  const [applicants, booked] = await Promise.all([store.submittedApplicants(cycleId), store.bookedApplicationIds(cycleId)]);
  const want = ids ? new Set(ids) : null;
  const todo = applicants.filter((a) => !booked.has(a.id) && (!want || want.has(a.id)));
  if (todo.length === 0) return { ok: false, reason: 'none' };
  const send = deps.send ?? sendMail;
  const from = deps.from ?? process.env.OPS_EMAIL_FROM;
  const origin = (deps.portalUrl ?? process.env.PORTAL_URL ?? DEFAULT_PORTAL_URL).replace(/\/+$/, '');
  const pause = deps.pauseMs ?? 550;
  const award = cycle.award_name ?? 'scholarship';
  const bookBy = emailDay(cycle.interview_end);
  const t = { sent: 0, skipped: 0, failed: 0, notConfigured: false };
  for (const a of todo) {
    const claim = await store.claim({ kind: 'book-reminder', cycle_id: cycleId, application_id: a.id, slot_id: null, recipient: remindKey(a.terpmail, now), to_address: a.terpmail });
    if (claim === 'not-ready') return { ok: false, reason: 'not-ready' };
    if (claim === false) {
      t.skipped += 1;
      continue;
    }
    const input = { firstName: firstName(a), to: a.terpmail, code: a.applicant_code ?? '', term: cycle.term, award, origin, helpEmail: HELP_EMAIL, bookBy };
    let r: SendResult;
    try {
      r = await send({ to: a.terpmail, subject: bookSubject(input), html: bookHtml(input), text: bookText(input), idempotencyKey: `book-reminder-${a.id}-${easternDate(now)}` }, from);
    } catch {
      r = { sent: false, reason: 'network' };
    }
    if (r.sent) {
      await store.setResendId(claim, r.id ?? null);
      t.sent += 1;
      await wait(pause);
    } else {
      await store.release(claim);
      if (r.reason === 'not-configured') t.notConfigured = true;
      else t.failed += 1;
    }
  }
  return { ok: true, ...t, at: now.toISOString() };
}

/** The page's words for a result. */
export function remindLine(r: RemindResult): { ok: boolean; message: string } {
  if (!r.ok) {
    const m: Record<typeof r.reason, string> = {
      'not-admin': 'Only board members with admin rights can remind students.',
      'no-service-key': "Email isn't set up here, so no emails went out.",
      'no-cycle': 'That cycle was not found.',
      'not-current': 'Reminders go only for the open cycle. No emails went out.',
      'interviews-over': 'The interview dates have passed. No emails went out.',
      'no-interview-end': 'Set the interview dates on the cycle first. No emails went out.',
      'not-ready': 'Reminders need a database update first. No emails went out.',
      none: 'Everyone listed has booked a time. No emails went out.',
    };
    return { ok: false, message: m[r.reason] };
  }
  if (r.notConfigured) return { ok: false, message: "Email isn't set up here, so no emails went out." };
  const parts: string[] = [];
  if (r.sent > 0) parts.push(`Reminded ${r.sent} ${r.sent === 1 ? 'student' : 'students'}.`);
  if (r.skipped > 0) parts.push(`${r.skipped} already had a reminder today.`);
  if (r.failed > 0) parts.push(`${r.failed} didn't go. Try again later.`);
  if (parts.length === 0) parts.push('No emails went out.');
  return { ok: r.failed === 0, message: parts.join(' ') };
}

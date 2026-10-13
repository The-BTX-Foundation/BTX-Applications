// Email sending for the Ops Hub. SERVER ONLY and ADMIN ONLY: every function checks that the caller is signed in as an
// admin, then uses the service role key to read applicant addresses. Nothing here is wired to a screen yet.
//
// Env: RESEND_API_KEY, OPS_EMAIL_FROM (the from-address), SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
// OPS_HUB_URL (staff invite link), PORTAL_URL (links in applicant emails; defaults to the live Portal).
// Without RESEND_API_KEY or OPS_EMAIL_FROM nothing is sent: the functions log what they would have sent and report it
// as "not configured" (and write nothing to email_log).
//
// "Never twice": before each send the function reserves a (kind, application) row in email_log. The table's unique
// index makes that atomic, so two admins clicking at once, or a retry, cannot send the same email twice. If the send
// fails the reservation is given back so a later run can try again.
import {
  bookHtml,
  bookSubject,
  bookText,
  emailDay,
  formatMoney,
  notPickedHtml,
  notPickedSubject,
  notPickedText,
  sendMail,
  staffInviteHtml,
  staffInviteSubject,
  staffInviteText,
  wonHtml,
  wonSubject,
  wonText,
  type Mail,
  type SendResult,
} from '@btx/emails';
import { roleInEmail, type StaffRole, isStaffRole } from '../role';
import type { ApplicantRow, EmailKind, EmailStore } from './store';

export const HELP_EMAIL = 'info@thebtxfoundation.org';
const DEFAULT_PORTAL_URL = 'https://apply.thebtxfoundation.org';
const BATCH_GAP_MS = 10 * 60 * 1000;

export type BatchResult =
  | {
      ok: true;
      kind: 'book' | 'decisions';
      /** Emails really sent. */
      sent: number;
      /** Applicants left out because they were already emailed, or (booking invites) already hold a booking. */
      skipped: number;
      /** Sends that failed; they can be retried by running the function again. */
      failed: number;
      /** True when no email service is set up on this server: nothing was sent, nothing was logged. */
      notConfigured: boolean;
      /** When the run finished (ISO). */
      at: string;
      /** Decision emails only: how many were "you won" and how many "not picked". */
      won?: number;
      notPicked?: number;
    }
  | { ok: false; reason: 'not-admin' | 'no-cycle' | 'not-released' | 'no-interview-end' | 'no-service-key' };

export type InviteResult = { ok: true; sent: boolean; reason?: string } | { ok: false; reason: 'not-admin' | 'bad-input' | 'no-ops-url' | 'no-service-key' };

// Everything the functions touch outside their own logic, replaceable in tests.
export type Deps = {
  store?: EmailStore;
  isAdmin?: () => Promise<boolean>;
  send?: (mail: Mail, from: string | undefined) => Promise<SendResult>;
  now?: () => Date;
  /** Milliseconds to wait between real sends (Resend allows about two a second). */
  pauseMs?: number;
  portalUrl?: string;
  opsUrl?: string;
  from?: string;
};

export async function defaultIsAdmin(): Promise<boolean> {
  const { sessionClient } = await import('../supabase-server');
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  return data.user?.app_metadata?.role === 'admin';
}

async function defaultStore(): Promise<EmailStore | null> {
  const { createServiceClient } = await import('@btx/data/server');
  const db = createServiceClient();
  if (!db) return null;
  const { supabaseStore } = await import('./store');
  return supabaseStore(db);
}

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const firstName = (a: ApplicantRow) => (a.full_name ?? '').trim().split(/\s+/)[0] || 'there';

type Plan = { applicant: ApplicantRow; kind: EmailKind; mail: Mail };

// Sends each planned email in turn: reserve, send, record the Resend id (or give the reservation back).
async function run(cycleId: string, plans: Plan[], d: Required<Pick<Deps, 'send' | 'pauseMs'>> & { store: EmailStore; from: string | undefined }) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let notConfigured = false;
  let won = 0;
  let notPicked = 0;
  for (const { applicant, kind, mail } of plans) {
    const claim = await d.store.claim({ kind, cycle_id: cycleId, application_id: applicant.id, to_address: applicant.terpmail });
    if (!claim) {
      skipped += 1;
      continue;
    }
    const result = await d.send({ ...mail, idempotencyKey: `${kind}-${applicant.id}` }, d.from);
    if (result.sent) {
      await d.store.setResendId(claim, result.id ?? null);
      sent += 1;
      if (kind === 'won') won += 1;
      if (kind === 'not-picked') notPicked += 1;
      await wait(d.pauseMs);
    } else {
      await d.store.release(claim);
      if (result.reason === 'not-configured') notConfigured = true;
      else failed += 1;
    }
  }
  return { sent, skipped, failed, notConfigured, won, notPicked };
}

async function setup(d: Deps) {
  const isAdmin = d.isAdmin ?? defaultIsAdmin;
  if (!(await isAdmin())) return { ok: false as const, error: 'not-admin' as const };
  const store = d.store ?? (await defaultStore());
  if (!store) return { ok: false as const, error: 'no-service-key' as const };
  return {
    ok: true as const,
    store,
    send: d.send ?? sendMail,
    now: d.now ?? (() => new Date()),
    pauseMs: d.pauseMs ?? 550,
    from: d.from ?? process.env.OPS_EMAIL_FROM,
    origin: (d.portalUrl ?? process.env.PORTAL_URL ?? DEFAULT_PORTAL_URL).replace(/\/+$/, ''),
  };
}

// "Interview times are open" to every submitted applicant of the cycle who holds no booking and was not sent this email.
export async function sendBookingInvites(cycleId: string, deps: Deps = {}): Promise<BatchResult> {
  const s = await setup(deps);
  if (!s.ok) return { ok: false, reason: s.error };
  const cycle = await s.store.cycle(cycleId);
  if (!cycle) return { ok: false, reason: 'no-cycle' };
  if (!cycle.interview_end) return { ok: false, reason: 'no-interview-end' };
  const [applicants, booked, already] = await Promise.all([
    s.store.submittedApplicants(cycleId),
    s.store.bookedApplicationIds(cycleId),
    s.store.loggedApplicationIds('book', cycleId),
  ]);
  const award = cycle.award_name ?? 'scholarship';
  const bookBy = emailDay(cycle.interview_end);
  const todo = applicants.filter((a) => !booked.has(a.id) && !already.has(a.id));
  const plans: Plan[] = todo.map((a) => {
    const input = { firstName: firstName(a), to: a.terpmail, code: a.applicant_code ?? '', term: cycle.term, award, origin: s.origin, helpEmail: HELP_EMAIL, bookBy };
    return { applicant: a, kind: 'book', mail: { to: a.terpmail, subject: bookSubject(input), html: bookHtml(input), text: bookText(input) } };
  });
  const r = await run(cycleId, plans, s);
  return { ok: true, kind: 'book', sent: r.sent, skipped: applicants.length - todo.length + r.skipped, failed: r.failed, notConfigured: r.notConfigured, at: s.now().toISOString() };
}

// "You won" to award winners and "not picked" to every other submitted applicant, once decisions are released.
export async function sendDecisionEmails(cycleId: string, deps: Deps = {}): Promise<BatchResult> {
  const s = await setup(deps);
  if (!s.ok) return { ok: false, reason: s.error };
  const cycle = await s.store.cycle(cycleId);
  if (!cycle) return { ok: false, reason: 'no-cycle' };
  if (!cycle.decisions_released_at || new Date(cycle.decisions_released_at) > s.now()) return { ok: false, reason: 'not-released' };
  const [applicants, awards, wonLogged, notLogged] = await Promise.all([
    s.store.submittedApplicants(cycleId),
    s.store.awards(cycleId),
    s.store.loggedApplicationIds('won', cycleId),
    s.store.loggedApplicationIds('not-picked', cycleId),
  ]);
  const awardByApp = new Map(awards.map((a) => [a.application_id, a]));
  const plans: Plan[] = [];
  let left = 0;
  for (const a of applicants) {
    const w = awardByApp.get(a.id);
    const code = a.applicant_code ?? '';
    if (w) {
      if (wonLogged.has(a.id)) {
        left += 1;
        continue;
      }
      const award = w.kind === 'main' ? (cycle.award_name ?? w.award_name) : w.award_name;
      const input = {
        firstName: firstName(a),
        to: a.terpmail,
        code,
        term: cycle.term,
        award,
        origin: s.origin,
        helpEmail: HELP_EMAIL,
        amount: formatMoney(w.amount_cents ?? cycle.award_amount_cents),
        photoDue: emailDay(cycle.photo_due),
      };
      plans.push({ applicant: a, kind: 'won', mail: { to: a.terpmail, subject: wonSubject(input), html: wonHtml(input), text: wonText(input) } });
    } else {
      if (notLogged.has(a.id)) {
        left += 1;
        continue;
      }
      const input = { firstName: firstName(a), to: a.terpmail, code, term: cycle.term, award: cycle.award_name ?? 'scholarship', origin: s.origin, helpEmail: HELP_EMAIL };
      plans.push({ applicant: a, kind: 'not-picked', mail: { to: a.terpmail, subject: notPickedSubject(input), html: notPickedHtml(input), text: notPickedText(input) } });
    }
  }
  const r = await run(cycleId, plans, s);
  return { ok: true, kind: 'decisions', sent: r.sent, skipped: left + r.skipped, failed: r.failed, notConfigured: r.notConfigured, at: s.now().toISOString(), won: r.won, notPicked: r.notPicked };
}

// The staff invite. Staff accounts are created elsewhere; this only emails the person.
export async function sendStaffInvite(input: { name: string; email: string; role: StaffRole }, deps: Deps = {}): Promise<InviteResult> {
  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isStaffRole(input.role)) return { ok: false, reason: 'bad-input' };
  const s = await setup(deps);
  if (!s.ok) return { ok: false, reason: s.error };
  const opsUrl = (deps.opsUrl ?? process.env.OPS_HUB_URL ?? '').replace(/\/+$/, '');
  if (!opsUrl) return { ok: false, reason: 'no-ops-url' };
  const mail = { name, to: email, role: roleInEmail(input.role), opsUrl };
  const result = await s.send({ to: email, subject: staffInviteSubject(mail), html: staffInviteHtml(mail), text: staffInviteText(mail) }, s.from);
  if (result.sent) {
    const claim = await s.store.claim({ kind: 'staff-invite', cycle_id: null, application_id: null, to_address: email });
    if (claim) await s.store.setResendId(claim, result.id ?? null);
  }
  return { ok: true, sent: result.sent, reason: result.reason };
}

// The latest batch of a kind for a cycle: how many went out and when the last one did. A batch is a run of sends with
// no gap longer than ten minutes. Admin only; { count: 0, at: null } when nothing was sent.
export async function lastSent(kind: EmailKind, cycleId: string, deps: Deps = {}): Promise<{ count: number; at: string | null }> {
  const isAdmin = deps.isAdmin ?? defaultIsAdmin;
  if (!(await isAdmin())) return { count: 0, at: null };
  const store = deps.store ?? (await defaultStore());
  if (!store) return { count: 0, at: null };
  const rows = await store.log(kind, cycleId); // newest first
  if (rows.length === 0) return { count: 0, at: null };
  let count = 1;
  for (let i = 1; i < rows.length; i += 1) {
    if (new Date(rows[i - 1].sent_at).getTime() - new Date(rows[i].sent_at).getTime() > BATCH_GAP_MS) break;
    count += 1;
  }
  return { count, at: rows[0].sent_at };
}

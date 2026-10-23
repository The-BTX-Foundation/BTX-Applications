// The interview-flow emails sent by the Ops Hub. SERVER ONLY. The renderers and "who gets what" live in @btx/emails
// (interview-mail.ts); this file finds the interviews, then sends each email once.
//
//   sendPrepEmails(now)              cron: the evening before, one prep email to each interviewer of tomorrow's interviews
//   sendReminderEmails(now)          cron: the morning before, the student's reminder
//   sendRebalanceEmails(cycleId, moves)   admin: after "Rebalance", tells the interviewer added and the one removed
//   sendVideoLinkEmails(cycleId, slotIds) admin: after video links are saved, tells the student and both interviewers
//   sendAvailabilityReminders(cycleId)    admin: "Remind the others", nudges the board members who have not sent their availability
//
// "Tomorrow" is the next calendar day in Eastern time (America/New_York), whatever the server's own zone, so it holds
// across the daylight-saving changes. The cron functions have no signed-in person: the cron route checks CRON_SECRET.
//
// Env: RESEND_API_KEY, OPS_EMAIL_FROM, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, PORTAL_URL (logo and "change
// your time" link; defaults to the live Portal), OPS_HUB_URL (the scorecard link). EMAIL_DEV_OUTBOX writes the emails to
// a folder instead of sending them (never in production).
//
// "Never twice": each email reserves a row in email_log (kind, application, slot, recipient) before it is sent, and gives
// it back when the send fails, so a later run can try again. Without RESEND_API_KEY or OPS_EMAIL_FROM nothing is sent
// and nothing is logged; the result says notConfigured.
import {
  deliverOnce,
  easternDate,
  planAvailabilityReminders,
  planPrep,
  planRebalance,
  planReminder,
  planVideoLink,
  readCycleInfo,
  readInterviews,
  readQuestionGroups,
  sendMail,
  supabaseMailLog,
  type InterviewRow,
  type MailLog,
  type Mail,
  type Planned,
  type PlanContext,
  type QuestionGroup,
  type SendResult,
} from '@btx/emails';
import type { RebalanceMove } from '../interview-flow-db';
import { easternDay, planAvailabilityPushes, planBookedPushes, planCancelledPushes, type PushItem } from '@btx/push';
import { defaultIsAdmin } from './send';
import { sendPushes } from '../push/server';

const DEFAULT_PORTAL_URL = 'https://apply.thebtxfoundation.org';

/** Sends pushes beside the emails. Never throws: a push problem must not change what the emails report. */
async function pushQuietly(deps: InterviewDeps, items: PushItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    await (deps.push ?? ((list: PushItem[]) => sendPushes(list)))(items);
  } catch (err) {
    console.error('[push] interview pushes failed', err instanceof Error ? err.message : 'unknown');
  }
}

export type InterviewMailResult =
  | { ok: true; kind: 'prep' | 'reminder' | 'rebalance' | 'video-link' | 'availability-reminder'; sent: number; skipped: number; failed: number; notConfigured: boolean; at: string; /** availability-reminder only: the full names of who got one. */ names?: string[] }
  | { ok: false; reason: 'not-admin' | 'no-service-key' | 'no-ops-url' };

/** What the senders read. The default reads the real database with the service role; tests pass their own. */
export interface InterviewMailData {
  interviews(q: { slotIds: string[] } | { from: string; to: string }): Promise<InterviewRow[]>;
  cycleInfo(cycleId: string): Promise<{ term: string; award: string }>;
  questions(cycleId: string): Promise<QuestionGroup[]>;
  /** A staff member's sign-in address, or null. */
  userEmail(userId: string): Promise<string | null>;
  /** Board members (staff with role admin or board and a profile): name, sign-in address and when they sent their availability for the cycle. */
  boardMembers(cycleId: string): Promise<{ userId: string; name: string; email: string | null; sentAt: string | null }[]>;
  /** When applications close (an instant), or null. */
  cycleCloses(cycleId: string): Promise<string | null>;
}

export type InterviewDeps = {
  data?: InterviewMailData;
  log?: MailLog;
  isAdmin?: () => Promise<boolean>;
  /** The signed-in person's user id (skipped by the availability reminder). */
  callerId?: () => Promise<string | null>;
  send?: (mail: Mail, from: string | undefined) => Promise<SendResult>;
  now?: () => Date;
  /** Sends pushes (the availability reminder also goes out as a push). The default uses the service role and the Apple key. */
  push?: (items: PushItem[]) => Promise<unknown>;
  /** Milliseconds between real sends (Resend allows about two a second). */
  pauseMs?: number;
  portalUrl?: string;
  opsUrl?: string;
  from?: string;
};

async function defaultServices(): Promise<{ data: InterviewMailData; log: MailLog } | null> {
  const { createServiceClient } = await import('@btx/data/server');
  const db = createServiceClient();
  if (!db) return null;
  return {
    data: {
      interviews: (q) => readInterviews(db, q),
      cycleInfo: (id) => readCycleInfo(db, id),
      questions: (id) => readQuestionGroups(db, id),
      userEmail: async (id) => (await db.auth.admin.getUserById(id)).data?.user?.email ?? null,
      boardMembers: async (cycleId) => {
        const [profiles, prefs, users] = await Promise.all([
          db.from('staff_profiles').select('user_id, display_name'),
          db.from('board_interview_prefs').select('user_id, availability_sent_at').eq('cycle_id', cycleId),
          db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);
        if (profiles.error || prefs.error || users.error) throw new Error('board members');
        const sent = new Map((prefs.data ?? []).map((p: { user_id: string; availability_sent_at: string | null }) => [p.user_id, p.availability_sent_at]));
        const auth = new Map(users.data.users.map((u) => [u.id, u]));
        return (profiles.data ?? [])
          .filter((p: { user_id: string }) => ['admin', 'board'].includes(String(auth.get(p.user_id)?.app_metadata?.role)))
          .map((p: { user_id: string; display_name: string }) => ({ userId: p.user_id, name: p.display_name, email: auth.get(p.user_id)?.email ?? null, sentAt: sent.get(p.user_id) ?? null }));
      },
      cycleCloses: async (id) => ((await db.from('cycles').select('closes_at').eq('id', id).maybeSingle()).data?.closes_at as string | null | undefined) ?? null,
    },
    log: supabaseMailLog(db),
  };
}

async function defaultCallerId(): Promise<string | null> {
  const { sessionClient } = await import('../supabase-server');
  return (await (await sessionClient()).auth.getUser()).data.user?.id ?? null;
}

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

async function setup(d: InterviewDeps, opts: { admin: boolean; needsOpsUrl?: boolean }) {
  if (opts.admin && !(await (d.isAdmin ?? defaultIsAdmin)())) return { ok: false as const, reason: 'not-admin' as const };
  const services = d.data && d.log ? { data: d.data, log: d.log } : await defaultServices();
  if (!services) return { ok: false as const, reason: 'no-service-key' as const };
  const opsUrl = (d.opsUrl ?? process.env.OPS_HUB_URL ?? '').replace(/\/+$/, '');
  if (opts.needsOpsUrl && !opsUrl) return { ok: false as const, reason: 'no-ops-url' as const };
  return {
    ok: true as const,
    data: d.data ?? services.data,
    log: d.log ?? services.log,
    callerId: d.callerId ?? defaultCallerId,
    send: d.send ?? sendMail,
    now: d.now ?? (() => new Date()),
    pauseMs: d.pauseMs ?? 550,
    from: d.from ?? process.env.OPS_EMAIL_FROM,
    portalUrl: (d.portalUrl ?? process.env.PORTAL_URL ?? DEFAULT_PORTAL_URL).replace(/\/+$/, ''),
    opsUrl,
  };
}
type Ready = Extract<Awaited<ReturnType<typeof setup>>, { ok: true }>;

// `sentTo`, when given, collects the address of each email that went.
async function run(s: Ready, plans: Planned[], sentTo?: string[]) {
  const t = { sent: 0, skipped: 0, failed: 0, notConfigured: false };
  for (const { claim, mail } of plans) {
    const r = await deliverOnce(s.log, claim, mail, s.from, s.send);
    if (r === 'sent') {
      t.sent += 1;
      sentTo?.push(claim.to_address);
      await wait(s.pauseMs);
    } else if (r === 'skipped') t.skipped += 1;
    else if (r === 'failed') t.failed += 1;
    else t.notConfigured = true;
  }
  return t;
}

const ctxFor = (s: Ready, info: { term: string; award: string }): PlanContext => ({ ...info, portalUrl: s.portalUrl, opsUrl: s.opsUrl, now: s.now() });

/** The next calendar day in Eastern time, "2026-11-11" (the day after `now`'s Eastern day; daylight-saving safe). */
export function tomorrowEastern(now: Date): string {
  const [y, m, d] = easternDate(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Booked interviews whose start is on tomorrow's Eastern date. The query window is wide (now to 50 hours on), and the
// Eastern date does the exact choosing, so a 23- or 25-hour day changes nothing.
async function tomorrowsInterviews(s: Ready): Promise<InterviewRow[]> {
  const now = s.now();
  const day = tomorrowEastern(now);
  const rows = await s.data.interviews({ from: now.toISOString(), to: new Date(now.getTime() + 50 * 3_600_000).toISOString() });
  return rows.filter((r) => easternDate(r.startsAt) === day);
}

async function cycleInfos(s: Ready, rows: InterviewRow[]) {
  const infos = new Map<string, { term: string; award: string }>();
  for (const id of new Set(rows.map((r) => r.cycleId))) infos.set(id, await s.data.cycleInfo(id));
  return infos;
}

// Cron: one prep email to each interviewer of every paired interview tomorrow, with the calendar invite attached.
export async function sendPrepEmails(now: Date = new Date(), deps: InterviewDeps = {}): Promise<InterviewMailResult> {
  const s = await setup({ ...deps, now: deps.now ?? (() => now) }, { admin: false, needsOpsUrl: true });
  if (!s.ok) return s;
  const rows = (await tomorrowsInterviews(s)).filter((r) => r.interviewers.length > 0);
  const infos = await cycleInfos(s, rows);
  const questions = new Map<string, QuestionGroup[]>();
  const plans: Planned[] = [];
  for (const r of rows) {
    if (!questions.has(r.cycleId)) questions.set(r.cycleId, await s.data.questions(r.cycleId));
    plans.push(...planPrep(r, questions.get(r.cycleId)!, ctxFor(s, infos.get(r.cycleId)!)));
  }
  const t = await run(s, plans);
  return { ok: true, kind: 'prep', ...t, at: s.now().toISOString() };
}

// Cron: the reminder to each student with an active booking tomorrow.
export async function sendReminderEmails(now: Date = new Date(), deps: InterviewDeps = {}): Promise<InterviewMailResult> {
  const s = await setup({ ...deps, now: deps.now ?? (() => now) }, { admin: false });
  if (!s.ok) return s;
  const rows = await tomorrowsInterviews(s);
  const infos = await cycleInfos(s, rows);
  const t = await run(s, rows.flatMap((r) => planReminder(r, ctxFor(s, infos.get(r.cycleId)!))));
  return { ok: true, kind: 'reminder', ...t, at: s.now().toISOString() };
}

// Admin only. `moves` is what rebalanceInterviews() returned: for each, the interviewer added gets "You're now
// interviewing ..." with a calendar invite and the one removed gets "You're no longer interviewing ..." with a cancel.
export async function sendRebalanceEmails(cycleId: string, moves: Pick<RebalanceMove, 'slotId' | 'from' | 'to' | 'fromName'>[], deps: InterviewDeps = {}): Promise<InterviewMailResult> {
  const s = await setup(deps, { admin: true, needsOpsUrl: true });
  if (!s.ok) return s;
  const rows = await s.data.interviews({ slotIds: moves.map((m) => m.slotId) });
  const bySlot = new Map(rows.map((r) => [r.slotId, r]));
  const info = await s.data.cycleInfo(cycleId);
  const plans: Planned[] = [];
  for (const m of moves) {
    const row = bySlot.get(m.slotId);
    if (!row) continue;
    plans.push(...planRebalance(row, { from: { name: m.fromName, email: await s.data.userEmail(m.from) }, toUserId: m.to }, ctxFor(s, info)));
  }
  const t = await run(s, plans);
  // The interviewer added gets "Interview booked" and the one removed gets "Interview cancelled" on their phones.
  await pushQuietly(
    deps,
    moves.flatMap((m) => {
      const row = bySlot.get(m.slotId);
      return row ? [...planBookedPushes({ ...row, interviewers: row.interviewers.filter((p) => p.userId === m.to) }, 'booked'), ...planCancelledPushes({ ...row, interviewers: [{ userId: m.from }] })] : [];
    }),
  );
  return { ok: true, kind: 'rebalance', ...t, at: s.now().toISOString() };
}

// Admin only. Call it after video links are saved: the student and both interviewers of each slot get the link.
// A slot with no link, or no booking, is left out. Saving the same link again sends nothing; a changed link sends again.
export async function sendVideoLinkEmails(cycleId: string, slotIds: string[], deps: InterviewDeps = {}): Promise<InterviewMailResult> {
  const s = await setup(deps, { admin: true });
  if (!s.ok) return s;
  const rows = (await s.data.interviews({ slotIds })).filter((r) => r.cycleId === cycleId);
  const info = await s.data.cycleInfo(cycleId);
  const t = await run(s, rows.flatMap((r) => planVideoLink(r, ctxFor(s, info))));
  return { ok: true, kind: 'video-link', ...t, at: s.now().toISOString() };
}

// Admin only. "Remind the others": the board members who have not sent their availability for the cycle each get one
// "Give your interview availability" email, never the caller. At most one a day per person (the log key carries the
// Eastern date), so pressing the button again the same day sends nothing and a later day sends again.
export async function sendAvailabilityReminders(cycleId: string, deps: InterviewDeps = {}): Promise<InterviewMailResult> {
  const s = await setup(deps, { admin: true, needsOpsUrl: true });
  if (!s.ok) return s;
  const me = await s.callerId();
  const waiting = (await s.data.boardMembers(cycleId)).filter((m) => !m.sentAt && m.userId !== me && m.email);
  const info = await s.data.cycleInfo(cycleId);
  const closes = await s.data.cycleCloses(cycleId);
  const people = waiting.map((m) => ({ name: m.name, email: m.email! }));
  const sentTo: string[] = [];
  const t = await run(s, planAvailabilityReminders(cycleId, people, closes, ctxFor(s, info)), sentTo);
  // The same nudge as a push, to the same people. A push problem never changes the emails' result.
  await pushQuietly(deps, planAvailabilityPushes({ cycleId, userIds: waiting.map((m) => m.userId), closesAt: closes, today: easternDay(s.now()) }));
  const got = new Set(sentTo);
  return { ok: true, kind: 'availability-reminder', ...t, names: people.filter((p) => got.has(p.email)).map((p) => p.name), at: s.now().toISOString() };
}

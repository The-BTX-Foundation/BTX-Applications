// Saves a student's "None of these times work" answer AND tells the board she is waiting for a time. SERVER ONLY.
//
// The save is sendFreeRanges (@btx/data) as the signed-in student, so her own session and the database's rules decide
// (her own submitted application, no active booking, the booking deadline). After a save, with the service role and after
// the answer has gone back (Next's after()):
//   1. the 24-hour rule: if an alert for this student already went out in the last 24 hours (email_log kind
//      'free-times'), nothing more is sent, so a student who fixes her ranges three times in an evening alerts once;
//   2. a push to every board member (admins and board): "Asked for other times", "Applicant 15 ..." (never her name);
//   3. an email to info@thebtxfoundation.org: "Ada Okafor asked for other interview times", her ranges in Eastern time and
//      a link to the Ops Hub's Interviews page. It goes through deliverOnce, whose email_log reservation keyed by
//      "<address>|<Eastern day>" stops two saves at the same moment from both emailing.
// A notify problem never changes the answer: the save stands and the student sees success.
import { deliverOnce, FREE_TIMES_ALERT_TO, freeTimesAlertHtml, freeTimesAlertSubject, freeTimesAlertText, sendMail, type Mail, type MailLog, type SendResult } from '@btx/emails';
import type { FreeRangesRow, SendFreeRangesResult } from '@btx/data';
import { easternDay, planAskedTimesPushes, type PushItem } from '@btx/push';

/** What the route answers: saved, or why not ('booking_closed' = the deadline passed and she had sent nothing before). */
export type FreeTimesResult = { ok: true } | { ok: false; kind: 'booking_closed' | 'refused' | 'failed' };

/** The student's application as the alert needs it (service role). */
export type AlertApplication = { name: string; code: string; cycleId: string | null };

/** Everything the notify step needs. Absent = no service key on this server: save only. */
export type NotifyDeps = {
  application: () => Promise<AlertApplication | null>;
  /** True when a 'free-times' alert for her went out at or after `sinceIso`. */
  recentAlert: (sinceIso: string) => Promise<boolean>;
  /** Every board member's user id (admins and board). */
  staffIds: () => Promise<string[]>;
  push: (items: PushItem[]) => Promise<unknown>;
  log: MailLog;
  send?: (mail: Mail, from: string | undefined) => Promise<SendResult>;
  from: string | undefined;
  /** The Ops Hub's address, like https://ops.thebtxfoundation.org. */
  opsUrl: string;
};

export type FreeTimesDeps = {
  /** sendFreeRanges as the signed-in student. */
  save: (row: FreeRangesRow) => Promise<SendFreeRangesResult>;
  /** After a refusal: has her cycle's booking deadline passed? null when it cannot be told. */
  closed: () => Promise<boolean | null>;
  notify: NotifyDeps | null;
  /** The clock (tests pass a fixed one). */
  now?: () => Date;
  /** Runs the notify step after the answer goes back (Next's after()). The default runs it first. */
  later?: (work: () => Promise<void>) => void | Promise<void>;
};

const DAY_MS = 24 * 3_600_000;

/** Saves her ranges, then (after the answer) alerts the board once per 24 hours. */
export async function saveAndNotify(applicationId: string, row: FreeRangesRow, d: FreeTimesDeps): Promise<FreeTimesResult> {
  let saved: SendFreeRangesResult;
  try {
    saved = await d.save(row);
  } catch {
    saved = { ok: false, code: null };
  }
  if (!saved.ok) {
    // 42501 is a row-level-security refusal. When her cycle's booking deadline has passed (she had sent nothing before it),
    // the screen sends her to /status, which shows the closed screen; any other refusal or failure keeps her on the page.
    if (saved.code === '42501') {
      const closed = await d.closed().catch(() => null);
      return { ok: false, kind: closed ? 'booking_closed' : 'refused' };
    }
    return { ok: false, kind: 'failed' };
  }

  const n = d.notify;
  if (n) {
    const work = async () => {
      try {
        await alertBoard(applicationId, row, n, (d.now ?? (() => new Date()))());
      } catch (err) {
        console.error('[free-times] could not alert the board', err instanceof Error ? err.message : 'unknown');
      }
    };
    if (d.later) await d.later(work);
    else await work();
  }
  return { ok: true };
}

// The notify step (see the top of the file). Pushes and the email each sit in their own try, so neither can stop the other.
async function alertBoard(applicationId: string, row: FreeRangesRow, n: NotifyDeps, now: Date): Promise<void> {
  const app = await n.application();
  if (!app) return;
  // The 24-hour rule. A failed read does not block the alert: the per-day reservation below still stops a double email.
  let recent = false;
  try {
    recent = await n.recentAlert(new Date(now.getTime() - DAY_MS).toISOString());
  } catch (err) {
    console.error('[free-times] could not read the email log', err instanceof Error ? err.message : 'unknown');
  }
  if (recent) return;
  const day = easternDay(now);

  try {
    const ids = await n.staffIds();
    if (ids.length > 0) await n.push(planAskedTimesPushes({ applicationId, code: app.code, userIds: ids, day }));
  } catch (err) {
    console.error('[free-times] could not send the pushes', err instanceof Error ? err.message : 'unknown');
  }

  try {
    const input = {
      name: app.name,
      code: app.code,
      said: row.said,
      ranges: row.ranges,
      interviewsUrl: `${n.opsUrl.replace(/\/+$/, '')}/scholarships/interviews#iz-oth`,
      sentAt: now.toISOString(),
    };
    const mail: Mail = { to: FREE_TIMES_ALERT_TO, subject: freeTimesAlertSubject(input), text: freeTimesAlertText(input), html: freeTimesAlertHtml(input), idempotencyKey: `free-times-${applicationId}-${day}` };
    await deliverOnce(
      n.log,
      { kind: 'free-times', cycle_id: app.cycleId, application_id: applicationId, slot_id: null, recipient: `${FREE_TIMES_ALERT_TO}|${day}`, to_address: FREE_TIMES_ALERT_TO },
      mail,
      n.from,
      n.send ?? sendMail,
    );
  } catch (err) {
    console.error('[free-times] could not send the email', err instanceof Error ? err.message : 'unknown');
  }
}

/** Any Supabase client holding the service role, kept structural (as in @btx/emails and @btx/push). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceDb = { from: (table: string) => any; auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { app_metadata?: Record<string, unknown> } | null } }> } } };

/**
 * Every board member (staff role admin or board), the same rule as the Ops Hub's staffUserIds (apps/ops/lib/push/server.ts):
 * the people in staff_profiles whose auth role is a staff role, read one by one (the auth project also holds every student).
 */
export async function readStaffIds(db: ServiceDb): Promise<string[]> {
  const profiles = await db.from('staff_profiles').select('user_id');
  if (profiles.error) throw new Error('staff list');
  const ids = [...new Set(((profiles.data ?? []) as { user_id: string }[]).map((p) => p.user_id))];
  const roles = await Promise.all(ids.map(async (id) => (await db.auth.admin.getUserById(id)).data.user?.app_metadata?.role));
  return ids.filter((_, i) => roles[i] === 'admin' || roles[i] === 'board');
}

/** Her application's name, code and cycle (service role), or null. */
export async function readAlertApplication(db: ServiceDb, applicationId: string): Promise<AlertApplication | null> {
  const r = await db.from('applications').select('full_name, applicant_code, cycle_id').eq('id', applicationId).maybeSingle();
  if (r.error || !r.data) return null;
  const a = r.data as { full_name: string | null; applicant_code: string | null; cycle_id: string | null };
  return { name: (a.full_name ?? '').trim(), code: a.applicant_code ?? '', cycleId: a.cycle_id };
}

/** True when a 'free-times' alert for this application is logged at or after `sinceIso` (service role). Throws on a failed read. */
export async function readRecentAlert(db: ServiceDb, applicationId: string, sinceIso: string): Promise<boolean> {
  const r = await db.from('email_log').select('id').eq('kind', 'free-times').eq('application_id', applicationId).gte('sent_at', sinceIso).limit(1);
  if (r.error) throw new Error('email log');
  return ((r.data ?? []) as unknown[]).length > 0;
}

/**
 * True when her application's cycle has a booking deadline that has passed (the database's booking_closed()), false when
 * not, null when it cannot be read (service role).
 */
export async function readBookingClosed(db: ServiceDb, applicationId: string, now: Date): Promise<boolean | null> {
  const a = await db.from('applications').select('cycle_id').eq('id', applicationId).maybeSingle();
  if (a.error || !a.data?.cycle_id) return null;
  const c = await db.from('cycles').select('booking_closes_at').eq('id', a.data.cycle_id).maybeSingle();
  if (c.error || !c.data) return null;
  const at = (c.data as { booking_closes_at: string | null }).booking_closes_at;
  return at !== null && now.getTime() >= Date.parse(at);
}

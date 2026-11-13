// "Needs cover": tells the admins (Kelsey and Dominick: staff with role admin) when a board member took a time out of
// their availability and nobody else is free to take over one of their interviews. SERVER ONLY; called by the
// Availability save after the person's own check (lib/actions/availability.ts), so it runs with the service role.
//
// One email per interview per admin per outgoing member per Eastern day: each reserves an email_log row before it is
// sent (kind 'rebalance', the slot, recipient "<email>|needs-cover|<outgoing member id>|<Eastern date>"; the existing
// per-slot index makes that atomic, so no new kind or migration is needed). The same member saving again the same day
// sends nothing more; a new needs-cover event (another member, or another day) alerts the admins again. A failed send
// gives the row back. Without RESEND_API_KEY or OPS_EMAIL_FROM nothing is sent or logged.
import { deliverOnce, easternDate, sendMail, supabaseMailLog, type Mail, type MailClaim, type MailLog, type SendResult } from '@btx/emails';

/** One interview that needs cover. `outgoingId`: the member whose save took them off it. `soon`: it starts within 48 hours,
 * so it was not moved automatically. */
export type NeedsCoverItem = { slotId: string; cycleId: string; outgoingId: string; applicant: string; code: string; when: string; soon?: boolean };

/** The dedupe key for one admin and one needs-cover event: per outgoing member and Eastern day. */
export function needsCoverKey(adminEmail: string, outgoingId: string, now: Date): string {
  return `${adminEmail.trim().toLowerCase()}|needs-cover|${outgoingId}|${easternDate(now)}`;
}

export type NeedsCoverDeps = {
  /** The admins' names and sign-in addresses. Default: auth users with app_metadata.role "admin". */
  admins?: () => Promise<{ name: string; email: string }[]>;
  log?: MailLog;
  send?: (mail: Mail, from: string | undefined) => Promise<SendResult>;
  from?: string;
  opsUrl?: string;
  now?: () => Date;
};

export type NeedsCoverResult = { sent: number; skipped: number; failed: number; notConfigured: boolean };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const first = (name: string) => name.trim().split(/\s+/)[0] || 'there';

/** The email to one admin about one interview. */
export function needsCoverMail(to: { name: string; email: string }, item: NeedsCoverItem, member: string, opsUrl: string): Mail {
  const link = opsUrl ? `${opsUrl}/scholarships/interviews/${encodeURIComponent(item.slotId)}` : '';
  const subject = `Needs cover: ${item.applicant}, ${item.when}`;
  const lines = [
    `Hi ${first(to.name)},`,
    item.soon
      ? `${member} took ${item.when} out of their availability. They are on the interview with ${item.applicant} (${item.code}) then. It starts within 48 hours, so it was not moved automatically.`
      : `${member} took ${item.when} out of their availability. They are on the interview with ${item.applicant} (${item.code}) then, and nobody else is free for the whole time.`,
    `${member} stays on it until you change the interviewer.`,
  ];
  const text = [...lines, ...(link ? ['', `Open the interview: ${link}`] : [])].join('\n\n');
  const html = lines.map((l) => `<p style="margin:0 0 12px;font:16px/1.5 Arial,sans-serif;color:#1d1d1f">${esc(l)}</p>`).join('') + (link ? `<p style="margin:0;font:16px/1.5 Arial,sans-serif"><a href="${esc(link)}">Open the interview</a></p>` : '');
  return { to: to.email, subject, html, text };
}

async function defaults(): Promise<{ admins: () => Promise<{ name: string; email: string }[]>; log: MailLog } | null> {
  const { createServiceClient } = await import('@btx/data/server');
  const db = createServiceClient();
  if (!db) return null;
  return {
    log: supabaseMailLog(db),
    admins: async () => {
      const [users, profiles] = await Promise.all([db.auth.admin.listUsers({ page: 1, perPage: 1000 }), db.from('staff_profiles').select('user_id, display_name')]);
      if (users.error || profiles.error) throw new Error('admins');
      const names = new Map((profiles.data ?? []).map((p: { user_id: string; display_name: string }) => [p.user_id, p.display_name]));
      return users.data.users.filter((u) => u.app_metadata?.role === 'admin' && u.email).map((u) => ({ name: names.get(u.id) ?? 'there', email: u.email as string }));
    },
  };
}

/** Emails every admin once about each interview that still needs cover. Never throws. */
export async function sendNeedsCoverEmails(items: NeedsCoverItem[], member: string, deps: NeedsCoverDeps = {}): Promise<NeedsCoverResult> {
  const t: NeedsCoverResult = { sent: 0, skipped: 0, failed: 0, notConfigured: false };
  if (items.length === 0) return t;
  try {
    const d = deps.admins && deps.log ? null : await defaults();
    const admins = deps.admins ?? d?.admins;
    const log = deps.log ?? d?.log;
    if (!admins || !log) return { ...t, notConfigured: true };
    const opsUrl = (deps.opsUrl ?? process.env.OPS_HUB_URL ?? '').replace(/\/+$/, '');
    const from = deps.from ?? process.env.OPS_EMAIL_FROM;
    const now = (deps.now ?? (() => new Date()))();
    for (const a of await admins()) {
      for (const item of items) {
        const claim: MailClaim = { kind: 'rebalance', cycle_id: item.cycleId, application_id: null, slot_id: item.slotId, recipient: needsCoverKey(a.email, item.outgoingId, now), to_address: a.email };
        const r = await deliverOnce(log, claim, needsCoverMail(a, item, member, opsUrl), from, deps.send ?? sendMail);
        if (r === 'sent') t.sent += 1;
        else if (r === 'skipped') t.skipped += 1;
        else if (r === 'failed') t.failed += 1;
        else t.notConfigured = true;
      }
    }
  } catch (err) {
    console.error('[needs-cover] emails failed', err instanceof Error ? err.message : 'unknown');
    t.failed += 1;
  }
  return t;
}

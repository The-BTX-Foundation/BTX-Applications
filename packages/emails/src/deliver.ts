// "Never twice" delivery for the interview emails, shared by the Ops Hub and the Portal. Before each send it reserves a
// row in email_log (the unique index on (kind, application, slot, recipient) makes that atomic, so a retry, a double
// click or two overlapping cron runs cannot send the same email twice). When the send fails, or no email service is
// set up, the reservation is given back so a later run can try again.
import { sendMail, type Mail, type SendResult } from './send';

export type InterviewMailKind = 'booked' | 'reminder' | 'prep' | 'video-link' | 'rebalance' | 'cancel';

export type MailClaim = {
  kind: InterviewMailKind;
  cycle_id: string | null;
  application_id: string | null;
  slot_id: string | null;
  /** Who it is for, as the "never twice" key. Usually the address; see the senders for the few kinds that add a suffix. */
  recipient: string;
  to_address: string;
};

export interface MailLog {
  /** Reserves the row. False when it is already taken. Returns the claim id otherwise. */
  claim(row: MailClaim): Promise<string | false>;
  setResendId(claimId: string, resendId: string | null): Promise<void>;
  release(claimId: string): Promise<void>;
}

export type Delivery = 'sent' | 'skipped' | 'failed' | 'not-configured';

export async function deliverOnce(
  log: MailLog,
  row: MailClaim,
  mail: Mail,
  from: string | undefined,
  send: (mail: Mail, from: string | undefined) => Promise<SendResult> = sendMail,
): Promise<Delivery> {
  const claim = await log.claim(row);
  if (!claim) return 'skipped';
  let result: SendResult;
  try {
    result = await send({ ...mail, idempotencyKey: mail.idempotencyKey ?? `${row.kind}-${row.slot_id ?? row.application_id ?? 'x'}-${row.recipient}`.slice(0, 250) }, from);
  } catch {
    result = { sent: false, reason: 'network' };
  }
  if (result.sent) {
    await log.setResendId(claim, result.id ?? null);
    return 'sent';
  }
  await log.release(claim);
  return result.reason === 'not-configured' ? 'not-configured' : 'failed';
}

// The email_log table through any Supabase client that holds the service role (kept structural so this package needs no
// Supabase dependency).
type LogDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function supabaseMailLog(db: LogDb): MailLog {
  return {
    async claim(row) {
      const { data, error } = await db.from('email_log').insert(row).select('id').single();
      if (error) {
        if (error.code === '23505') return false; // the unique index: already sent
        throw new Error(`email log claim: ${error.message}`);
      }
      return (data as { id: string }).id;
    },
    async setResendId(claimId, resendId) {
      const { error } = await db.from('email_log').update({ resend_id: resendId }).eq('id', claimId);
      if (error) console.error('[email] could not record the Resend id', error.message);
    },
    async release(claimId) {
      const { error } = await db.from('email_log').delete().eq('id', claimId);
      if (error) console.error('[email] could not give back an email_log reservation', error.message);
    },
  };
}

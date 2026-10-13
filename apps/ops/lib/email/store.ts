// The data the email functions read and write, behind one small interface so the logic can be tested without a database.
// supabaseStore() is the real thing: it uses the SERVICE ROLE client (server only) because admins' own sessions cannot
// read every applicant's address, including drafts and other cycles, and email_log is written only by the server.
import type { ServiceClient } from '@btx/data/server';

export type EmailKind = 'confirmation' | 'book' | 'won' | 'not-picked' | 'staff-invite';

export type CycleRow = {
  id: string;
  term: string;
  award_name: string | null;
  award_amount_cents: number | null;
  interview_end: string | null; // a date, "2026-10-17"
  photo_due: string | null; // a date
  decisions_released_at: string | null;
};
export type ApplicantRow = { id: string; full_name: string | null; terpmail: string; applicant_code: string | null };
export type AwardRow = { application_id: string; award_name: string; amount_cents: number | null; kind: string };
export type LogRow = { kind: EmailKind; sent_at: string };
export type ClaimRow = { kind: EmailKind; cycle_id: string | null; application_id: string | null; to_address: string };

export interface EmailStore {
  cycle(cycleId: string): Promise<CycleRow | null>;
  submittedApplicants(cycleId: string): Promise<ApplicantRow[]>;
  /** Ids of applications that hold an active interview booking. */
  bookedApplicationIds(cycleId: string): Promise<Set<string>>;
  /** Main and extra awards of the cycle (not past ones). */
  awards(cycleId: string): Promise<AwardRow[]>;
  /** Application ids that already have a log row of this kind. */
  loggedApplicationIds(kind: EmailKind, cycleId: string): Promise<Set<string>>;
  /** Reserves the (kind, application) slot. False when it is already taken (never twice). Returns the claim id otherwise. */
  claim(row: ClaimRow): Promise<string | false>;
  setResendId(claimId: string, resendId: string | null): Promise<void>;
  /** Gives the slot back when the send failed, so a later run can try again. */
  release(claimId: string): Promise<void>;
  /** Log rows of a kind for a cycle, newest first. */
  log(kind: EmailKind, cycleId: string | null): Promise<LogRow[]>;
}

type Db = ServiceClient;

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`email store: ${what}: ${error?.message ?? 'unknown error'}`);
}

export function supabaseStore(db: Db): EmailStore {
  return {
    async cycle(cycleId) {
      const { data, error } = await db
        .from('cycles')
        .select('id, term, award_name, award_amount_cents, interview_end, photo_due, decisions_released_at')
        .eq('id', cycleId)
        .maybeSingle();
      if (error) fail('cycle', error);
      return (data as CycleRow | null) ?? null;
    },
    async submittedApplicants(cycleId) {
      const { data, error } = await db
        .from('applications')
        .select('id, full_name, terpmail, applicant_code')
        .eq('cycle_id', cycleId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });
      if (error) fail('applicants', error);
      return (data as ApplicantRow[]) ?? [];
    },
    async bookedApplicationIds(cycleId) {
      const { data, error } = await db
        .from('bookings')
        .select('application_id, interview_slots!inner(cycle_id)')
        .eq('status', 'active')
        .eq('interview_slots.cycle_id', cycleId);
      if (error) fail('bookings', error);
      return new Set(((data as { application_id: string }[]) ?? []).map((r) => r.application_id));
    },
    async awards(cycleId) {
      const { data, error } = await db
        .from('scholarship_awards')
        .select('application_id, award_name, amount_cents, kind')
        .eq('cycle_id', cycleId)
        .in('kind', ['main', 'extra'])
        .not('application_id', 'is', null);
      if (error) fail('awards', error);
      return (data as AwardRow[]) ?? [];
    },
    async loggedApplicationIds(kind, cycleId) {
      const { data, error } = await db.from('email_log').select('application_id').eq('kind', kind).eq('cycle_id', cycleId).not('application_id', 'is', null);
      if (error) fail('email_log read', error);
      return new Set(((data as { application_id: string }[]) ?? []).map((r) => r.application_id));
    },
    async claim(row) {
      const { data, error } = await db.from('email_log').insert(row).select('id').single();
      if (error) {
        if ((error as { code?: string }).code === '23505') return false; // the unique index: already sent
        fail('email_log claim', error);
      }
      return (data as { id: string }).id;
    },
    async setResendId(claimId, resendId) {
      const { error } = await db.from('email_log').update({ resend_id: resendId }).eq('id', claimId);
      if (error) fail('email_log update', error);
    },
    async release(claimId) {
      const { error } = await db.from('email_log').delete().eq('id', claimId);
      if (error) fail('email_log release', error);
    },
    async log(kind, cycleId) {
      let q = db.from('email_log').select('kind, sent_at').eq('kind', kind).order('sent_at', { ascending: false }).limit(5000);
      if (cycleId) q = q.eq('cycle_id', cycleId);
      const { data, error } = await q;
      if (error) fail('email_log read', error);
      return (data as LogRow[]) ?? [];
    },
  };
}

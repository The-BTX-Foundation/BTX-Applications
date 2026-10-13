// Runs the real store against a LOCAL Supabase (never production) with email sending off, to check recipients. Skipped
// unless LIVE_EMAIL_DB=1 and the local env vars are set. Creates only its own rows (c1-live-*) and removes them.
import { describe, expect, it } from 'vitest';
import { createServiceClient } from '@btx/data/server';
import { sendBookingInvites, sendDecisionEmails } from '@/lib/email/send';
import { supabaseStore } from '@/lib/email/store';

const live = process.env.LIVE_EMAIL_DB === '1' && (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('127.0.0.1');

describe.skipIf(!live)('email recipients against the local database', () => {
  it('picks the right people and logs nothing while sending is off', async () => {
    const db = createServiceClient()!;
    const store = supabaseStore(db);
    const stamp = Date.now();
    const { data: cycle, error: e0 } = await db.from('cycles').insert({ term: `C1 live ${stamp}`, year: 2026, status: 'draft', award_name: 'Legacy Scholarship', award_amount_cents: 200000, interview_end: '2026-10-30', photo_due: '2026-11-20' }).select('id').single();
    if (e0) throw e0;
    const cycleId = (cycle as { id: string }).id;
    const users: string[] = [];
    try {
      const ids: string[] = [];
      for (const n of [1, 2, 3, 4]) {
        const { data, error } = await db.auth.admin.createUser({ email: `c1-live-${stamp}-${n}@btx.test`, email_confirm: true });
        if (error) throw error;
        users.push(data.user.id);
        const status = n === 4 ? 'draft' : 'submitted';
        const { data: app, error: e2 } = await db.from('applications').insert({ user_id: data.user.id, cycle_id: cycleId, terpmail: `c1-live-${stamp}-${n}@btx.test`, full_name: `Live Person${n}`, status, ...(status === 'submitted' ? { applicant_code: `LIVE-${stamp}-${n}`, submitted_at: new Date().toISOString(), agreed_true: true } : {}) }).select('id').single();
        if (e2) throw e2;
        ids.push((app as { id: string }).id);
      }
      const { data: slot, error: e3 } = await db.from('interview_slots').insert({ cycle_id: cycleId, starts_at: '2026-10-28T15:00:00Z', ends_at: '2026-10-28T15:30:00Z' }).select('id').single();
      if (e3) throw e3;
      const { error: e4 } = await db.from('bookings').insert({ application_id: ids[1], slot_id: (slot as { id: string }).id });
      if (e4) throw e4;

      const base = { store, isAdmin: async () => true, send: async () => ({ sent: false, reason: 'not-configured' }), pauseMs: 0 };
      // Booking invites: 3 submitted, 1 booked -> 2 recipients (the draft never counts).
      expect(await store.submittedApplicants(cycleId)).toHaveLength(3);
      expect([...(await store.bookedApplicationIds(cycleId))]).toEqual([ids[1]]);
      const book = await sendBookingInvites(cycleId, base);
      expect(book).toMatchObject({ ok: true, sent: 0, failed: 0, notConfigured: true, skipped: 1 });
      // Decisions are refused until released.
      expect(await sendDecisionEmails(cycleId, base)).toEqual({ ok: false, reason: 'not-released' });
      // Real claims in the real table: the unique index stops a second claim.
      const first = await store.claim({ kind: 'book', cycle_id: cycleId, application_id: ids[0], to_address: 'x@btx.test' });
      expect(first).toBeTruthy();
      expect(await store.claim({ kind: 'book', cycle_id: cycleId, application_id: ids[0], to_address: 'x@btx.test' })).toBe(false);
      expect([...(await store.loggedApplicationIds('book', cycleId))]).toEqual([ids[0]]);
      await store.release(first as string);
    } finally {
      await db.from('email_log').delete().eq('cycle_id', cycleId);
      await db.from('bookings').delete().in('application_id', (await db.from('applications').select('id').eq('cycle_id', cycleId)).data?.map((r) => (r as { id: string }).id) ?? []);
      await db.from('cycles').delete().eq('id', cycleId);
      for (const u of users) await db.auth.admin.deleteUser(u);
    }
  });
});

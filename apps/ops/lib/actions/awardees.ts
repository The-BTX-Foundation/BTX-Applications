'use server';

// Write actions for Scholarships > Awardees: tick or untick an awardee step, send another reminder.
//
// Mock mode: kept in memory (mock/awardees.ts, awardeeStore) for the life of the server process.
// NOT TESTED, NEEDS THE OPS HUB TABLES: live mode calls the draft schema as defined in
// supabase/migrations/20261010120000_ops_hub.sql (branch db/ops-schema):
//   - ticking steps 1, 2, 3 or 5 updates `award_steps` (done_at, done_by) for (award_id, step); unticking clears them.
//   - ticking step 4 "Funds sent" calls the function `mark_award_funds_sent(p_award_id, p_paid_on)`, which ticks the step,
//     sets paid_on and logs the amount under that year's Scholarships category in one step (errors: already_paid,
//     no_amount, no_scholarship_category). Unticking step 4 is not offered (the draft has no way to reverse the logged spending).
//   - "Send another reminder" sets `award_steps.reminder_sent_at`. The draft schema has no email sender, so only the date is
//     recorded; nothing is emailed.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '../supabase-server';
import { awardeeStore } from '@/mock/awardees';

type Result = { ok: boolean; message: string };
type Err = { message: string } | null;
type Loose = {
  rpc: (fn: string, args: object) => PromiseLike<{ error: Err }>;
  from: (t: string) => { update: (v: object) => { eq: (c: string, v: string | number) => { eq: (c: string, v: string | number) => PromiseLike<{ error: Err }> } } };
};

export async function setStepDone(awardId: string, step: number, done: boolean): Promise<Result> {
  if (!hasSupabaseEnv()) {
    const st = awardeeStore();
    st.done[awardId] ??= {};
    if (done) st.done[awardId][step] = new Date().toISOString();
    else delete st.done[awardId][step];
    return { ok: true, message: 'Saved.' };
  }
  const client = (await sessionClient()) as unknown as Loose;
  if (step === 4) {
    if (!done) return { ok: false, message: 'Funds sent cannot be undone here.' };
    const { error } = await client.rpc('mark_award_funds_sent', { p_award_id: awardId, p_paid_on: new Date().toISOString().slice(0, 10) });
    return error ? { ok: false, message: error.message } : { ok: true, message: 'Saved.' };
  }
  const { error } = await client.from('award_steps').update({ done_at: done ? new Date().toISOString() : null }).eq('award_id', awardId).eq('step', step);
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Saved.' };
}

export async function sendReminder(awardId: string, step: number): Promise<Result> {
  if (!hasSupabaseEnv()) {
    awardeeStore().reminders[awardId] = new Date().toISOString();
    return { ok: true, message: 'Reminder noted.' };
  }
  const client = (await sessionClient()) as unknown as Loose;
  const { error } = await client.from('award_steps').update({ reminder_sent_at: new Date().toISOString() }).eq('award_id', awardId).eq('step', step);
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Reminder noted.' };
}

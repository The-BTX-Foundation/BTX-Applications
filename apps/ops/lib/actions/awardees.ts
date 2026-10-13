'use server';

// Write actions for Scholarships > Awardees: tick or untick an awardee step, send another reminder.
//
// Mock mode: kept in memory (mock/awardees.ts, awardeeStore) for the life of the server process.
// Live mode, as the signed-in person (admin and board may write award steps; the database rules decide):
//   - setStepDone (tested live 2026-10-12 on the local stack: tick and untick as admin and board): ticking steps 1, 2, 3 or 5 sets `award_steps` done_at and done_by for
//     (award_id, step); unticking clears them.
//   - Funds sent (tested live 2026-10-12 on the local stack: logged once, then already_paid): ticking step 4 calls mark_award_funds_sent(p_award_id, p_paid_on), which ticks the
//     step, sets paid_on and logs the amount under that year's Scholarships budget category in one step (errors:
//     already_paid, no_amount, no_scholarship_category:<year>). Unticking step 4 is not offered (nothing reverses the
//     logged spending).
//   - sendReminder (tested live 2026-10-12 on the local stack): records `award_steps.reminder_sent_at`. Nothing is emailed yet (email is another
//     stream's work), so only the date is recorded.
import { hasSupabaseEnv } from '@btx/data';
import { fundsErrorMessage } from '../sch-logic';
import { db, whoAmI } from '../sch-live';
import { awardeeStore } from '@/mock/awardees';

type Result = { ok: boolean; message: string };

// Today in Eastern time, "2026-10-26".
const todayEastern = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

export async function setStepDone(awardId: string, step: number, done: boolean): Promise<Result> {
  if (!hasSupabaseEnv()) {
    const st = awardeeStore();
    st.done[awardId] ??= {};
    if (done) st.done[awardId][step] = new Date().toISOString();
    else delete st.done[awardId][step];
    return { ok: true, message: 'Saved.' };
  }
  if (![1, 2, 3, 4, 5].includes(step)) return { ok: false, message: 'That step was not found.' };
  const client = await db();
  if (step === 4) {
    if (!done) return { ok: false, message: 'Funds sent cannot be undone here.' };
    const { error } = await client.rpc('mark_award_funds_sent', { p_award_id: awardId, p_paid_on: todayEastern() });
    return error ? { ok: false, message: fundsErrorMessage(error) } : { ok: true, message: 'Saved. The payment is logged on Budget.' };
  }
  const me = await whoAmI(client);
  const { data, error } = await client
    .from('award_steps')
    .update(done ? { done_at: new Date().toISOString(), done_by: me?.id ?? null } : { done_at: null, done_by: null })
    .eq('award_id', awardId)
    .eq('step', step)
    .select('step');
  if (error) return { ok: false, message: "That didn't save. Try again." };
  if ((data ?? []).length === 0) return { ok: false, message: 'Only admins and board members can change awardee steps.' };
  return { ok: true, message: 'Saved.' };
}

export async function sendReminder(awardId: string, step: number): Promise<Result> {
  if (!hasSupabaseEnv()) {
    awardeeStore().reminders[awardId] = new Date().toISOString();
    return { ok: true, message: 'Reminder noted.' };
  }
  const client = await db();
  const { data, error } = await client.from('award_steps').update({ reminder_sent_at: new Date().toISOString() }).eq('award_id', awardId).eq('step', step).select('step');
  if (error || (data ?? []).length === 0) return { ok: false, message: "That didn't save. Try again." };
  return { ok: true, message: 'Reminder noted. Nothing is emailed yet.' };
}

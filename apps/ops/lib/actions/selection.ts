'use server';

// Write actions for Scholarships > Selection: record an award, undo it, say "no extra award", send the agenda.
//
// Mock mode: kept in memory (mock/selection.ts, selectionStore) for the life of the server process.
// NOT TESTED, NEEDS THE OPS HUB TABLES: live mode calls the draft schema as defined in
// supabase/migrations/20261010120000_ops_hub.sql (branch db/ops-schema):
//   - recording an award inserts a `scholarship_awards` row (cycle_id, application_id, award_name, amount_cents,
//     kind 'main' | 'extra', decision_note); the trigger `award_steps_create` then makes its five awardee steps.
//     decided_by defaults to auth.uid(). One award per application (unique application_id).
//   - undo deletes that row (its award_steps go with it). The draft policies let admin and board write awards.
//   - "No extra award" and "Send the agenda" have no table or function in the draft schema: live mode answers that they
//     are not connected instead of guessing.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '../supabase-server';
import { selectionStore } from '@/mock/selection';

type Result = { ok: boolean; message: string; id?: string };
type Err = { message: string } | null;
type Loose = {
  from: (t: string) => {
    insert: (v: object) => { select: (c: string) => { single: () => PromiseLike<{ data: { id: string } | null; error: Err }> } };
    delete: () => { eq: (c: string, v: string) => PromiseLike<{ error: Err }> };
  };
};

export async function recordAward(input: { cycleId: string | null; applicationId: string; code: string; initials: string; kind: 'main' | 'extra'; awardName: string; amountCents: number; note: string }): Promise<Result> {
  if (!hasSupabaseEnv()) {
    const st = selectionStore();
    if (st.awards.some((a) => a.code === input.code)) return { ok: false, message: 'That applicant already has an award.' };
    if (input.kind === 'main' && st.awards.some((a) => a.kind === 'main')) return { ok: false, message: 'The Legacy award is already recorded.' };
    const id = `mock-award-${st.awards.length + 1}`;
    st.awards.push({ id, code: input.code, initials: input.initials, kind: input.kind, awardName: input.awardName, amountCents: input.amountCents, note: input.note });
    return { ok: true, message: 'Recorded.', id };
  }
  const client = (await sessionClient()) as unknown as Loose;
  const { data, error } = await client
    .from('scholarship_awards')
    .insert({ cycle_id: input.cycleId, application_id: input.applicationId, award_name: input.awardName, amount_cents: input.amountCents, kind: input.kind, decision_note: input.note })
    .select('id')
    .single();
  return error || !data ? { ok: false, message: error?.message ?? 'Could not record the award.' } : { ok: true, message: 'Recorded.', id: data.id };
}

export async function undoAward(awardId: string): Promise<Result> {
  if (!hasSupabaseEnv()) {
    const st = selectionStore();
    st.awards = st.awards.filter((a) => a.id !== awardId);
    return { ok: true, message: 'Undone.' };
  }
  const client = (await sessionClient()) as unknown as Loose;
  const { error } = await client.from('scholarship_awards').delete().eq('id', awardId);
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Undone.' };
}

export async function chooseNoExtra(value: boolean): Promise<Result> {
  if (!hasSupabaseEnv()) {
    selectionStore().noExtra = value;
    return { ok: true, message: 'Saved.' };
  }
  return { ok: false, message: 'This is not connected yet. It needs the Ops Hub tables.' };
}

export async function sendAgenda(): Promise<Result> {
  if (!hasSupabaseEnv()) {
    selectionStore().agendaSent = true;
    return { ok: true, message: 'Agenda sent to the board.' };
  }
  return { ok: false, message: 'Sending is not connected yet.' };
}

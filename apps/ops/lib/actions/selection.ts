'use server';

// Write actions for Scholarships > Selection: record an award, undo it, say "no extra award", send the agenda, and
// release the decisions to applicants.
//
// Mock mode: kept in memory (mock/selection.ts, selectionStore) for the life of the server process.
// Live mode, as the signed-in person (admin and board may write awards; the database rules decide):
//   - recordAward (tested live 2026-10-12 on the local stack: main and extra, a second main refused, a second award
//     for the same applicant refused) inserts a `scholarship_awards` row (cycle_id, application_id, award_name,
//     amount_cents, kind 'main' | 'extra', decision_note); the trigger award_steps_create() then makes its five
//     awardee steps. decided_by defaults to auth.uid(). Any submitted applicant can be chosen (the board decides; the
//     ranking is information only). One award per application (unique application_id), and one main award per cycle
//     (checked here: the table has no rule for it).
//   - undoAward (tested live 2026-10-12 on the local stack: undone, and refused after the letter step is ticked) deletes that row (its award_steps go with it), only until the award letter is ticked.
//   - releaseDecisions (tested live 2026-10-12 on the local stack on a separate draft cycle: refused for board, refused
//     before the main award, stamped once, repeat answers with the same time) sets cycles.decisions_released_at (admins only, main award first, idempotent;
//     the rule is lib/release.ts). There is no button for it yet (design pending).
//   - "No extra award" has no table or column, and "Send the agenda" is hidden until email is set up (O8): live mode
//     answers that they are not connected instead of guessing.
import { hasSupabaseEnv } from '@btx/data';
import { db, whoAmI } from '../sch-live';
import { releaseDecisionsWith, type ReleaseResult } from '../release';
import { selectionStore } from '@/mock/selection';

type Result = { ok: boolean; message: string; id?: string };

export async function recordAward(input: { cycleId: string | null; applicationId: string; code: string; name: string; kind: 'main' | 'extra'; awardName: string; amountCents: number; note: string }): Promise<Result> {
  if (!hasSupabaseEnv()) {
    const st = selectionStore();
    if (st.awards.some((a) => a.code === input.code)) return { ok: false, message: 'That applicant already has an award.' };
    if (input.kind === 'main' && st.awards.some((a) => a.kind === 'main')) return { ok: false, message: 'The main award is already recorded.' };
    const id = `mock-award-${st.awards.length + 1}`;
    st.awards.push({ id, code: input.code, name: input.name, kind: input.kind, awardName: input.awardName, amountCents: input.amountCents, note: input.note });
    return { ok: true, message: 'Recorded.', id };
  }
  if (!input.cycleId) return { ok: false, message: 'There is no open cycle.' };
  const client = await db();
  if (input.kind === 'main') {
    const existing = await client.from('scholarship_awards').select('id').eq('cycle_id', input.cycleId).eq('kind', 'main').limit(1);
    if (existing.error) return { ok: false, message: "That didn't save. Try again." };
    if ((existing.data ?? []).length > 0) return { ok: false, message: 'The main award is already recorded.' };
  }
  const { data, error } = await client
    .from('scholarship_awards')
    .insert({ cycle_id: input.cycleId, application_id: input.applicationId, award_name: input.awardName, amount_cents: input.amountCents, kind: input.kind, decision_note: input.note.slice(0, 2000) })
    .select('id')
    .single();
  if (error || !data) {
    const dup = error?.code === '23505';
    return { ok: false, message: dup ? 'That applicant already has an award.' : error?.code === '42501' ? 'Only board members can record awards.' : "That didn't save. Try again." };
  }
  return { ok: true, message: 'Recorded.', id: (data as { id: string }).id };
}

export async function undoAward(awardId: string): Promise<Result> {
  if (!hasSupabaseEnv()) {
    const st = selectionStore();
    st.awards = st.awards.filter((a) => a.id !== awardId);
    return { ok: true, message: 'Undone.' };
  }
  const client = await db();
  // "Undo until the letter goes out": refuse once step 1 (award letter sent) is ticked.
  const letter = await client.from('award_steps').select('done_at').eq('award_id', awardId).eq('step', 1).maybeSingle();
  if (letter.error) return { ok: false, message: "That didn't undo. Try again." };
  if ((letter.data as { done_at: string | null } | null)?.done_at) return { ok: false, message: 'The award letter has gone out, so this award can no longer be undone here.' };
  const { data, error } = await client.from('scholarship_awards').delete().eq('id', awardId).select('id');
  if (error) return { ok: false, message: error.code === '23503' ? 'Funds were already sent for this award, so it can no longer be undone.' : "That didn't undo. Try again." };
  if ((data ?? []).length === 0) return { ok: false, message: 'That award was not found.' };
  return { ok: true, message: 'Undone.' };
}

export async function chooseNoExtra(value: boolean): Promise<Result> {
  if (!hasSupabaseEnv()) {
    selectionStore().noExtra = value;
    return { ok: true, message: 'Saved.' };
  }
  return { ok: false, message: 'This is not connected yet.' };
}

export async function sendAgenda(): Promise<Result> {
  if (!hasSupabaseEnv()) {
    selectionStore().agendaSent = true;
    return { ok: true, message: 'Agenda sent to the board.' };
  }
  return { ok: false, message: 'Sending is not connected yet.' };
}

/** Releases the cycle's decisions to applicants (admins only, once the main award is recorded; safe to repeat). */
export async function releaseDecisions(cycleId: string): Promise<ReleaseResult> {
  if (!hasSupabaseEnv()) {
    const st = selectionStore();
    return releaseDecisionsWith(
      {
        role: async () => 'admin',
        releasedAt: async () => st.releasedAt,
        hasMainAward: async () => st.awards.some((a) => a.kind === 'main'),
        stamp: async (_id, at) => (st.releasedAt ? null : (st.releasedAt = at)),
      },
      cycleId || 'mock-cycle',
    );
  }
  const client = await db();
  try {
    return await releaseDecisionsWith(
      {
        role: async () => (await whoAmI(client))?.role ?? null,
        releasedAt: async (id) => {
          const { data, error } = await client.from('cycles').select('decisions_released_at').eq('id', id).maybeSingle();
          if (error) throw error;
          return data ? ((data as { decisions_released_at: string | null }).decisions_released_at ?? null) : undefined;
        },
        hasMainAward: async (id) => {
          const { data, error } = await client.from('scholarship_awards').select('id').eq('cycle_id', id).eq('kind', 'main').limit(1);
          if (error) throw error;
          return (data ?? []).length > 0;
        },
        stamp: async (id, at) => {
          const { data, error } = await client.from('cycles').update({ decisions_released_at: at }).eq('id', id).is('decisions_released_at', null).select('decisions_released_at');
          if (error) throw error;
          return ((data ?? []) as { decisions_released_at: string }[])[0]?.decisions_released_at ?? null;
        },
      },
      cycleId,
    );
  } catch {
    return { ok: false, message: "Decisions weren't released. Try again." };
  }
}

'use client';

// The Programs pages' writes, called from the page components in the browser. Mock mode (no Supabase env): each action
// succeeds in memory and the component keeps the new row in its own state. Live mode writes the Ops Hub tables and
// functions as the signed-in person (checked against the local database as admin and as board). Sharing the mentor
// application has no table or function in the schema, so it answers "not connected yet"; mentor pairings stay out (O14).
import { failure, isMock, localId, loose, notConnected, type ActionResult } from './common';

/** "Add an idea" on Certifications: a row in `certification_ideas` (decision starts as not_decided). */
export async function addCertificationIdea(input: { programId?: string; name: string }): Promise<ActionResult<{ id: string }>> {
  if (isMock()) return { ok: true, id: localId('idea') };
  if (!input.programId) return notConnected();
  try {
    const { data, error } = await loose().from('certification_ideas').insert({ program_id: input.programId, name: input.name }).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return failure(e);
  }
}

/**
 * "Add a task" on a program page: a step (a row in `tasks`, area programs) at the end of the program's checklist. When
 * the program has no checklist yet, it is created first ("Setup checklist") and its id is returned for the next add.
 */
export async function addProgramTask(input: { title: string; checklistId?: string; programId?: string }): Promise<ActionResult<{ id: string; checklistId?: string }>> {
  if (isMock()) return { ok: true, id: localId('task') };
  try {
    const db = loose();
    let checklistId = input.checklistId;
    if (!checklistId && input.programId) {
      const made = await db.from('checklists').insert({ title: 'Setup checklist', area: 'programs', program_id: input.programId }).select('id').single();
      if (made.error || !made.data) throw made.error ?? new Error('not saved');
      checklistId = String(made.data.id);
    }
    const row: Record<string, unknown> = { title: input.title, area: 'programs' };
    if (checklistId) {
      // The new step goes last.
      const last = await db.from('tasks').select('position').eq('checklist_id', checklistId).order('position', { ascending: false }).limit(1);
      if (last.error) throw last.error;
      const top = ((last.data ?? []) as { position?: number }[])[0]?.position ?? -1;
      row.checklist_id = checklistId;
      row.position = Number(top) + 1;
    }
    const { data, error } = await db.from('tasks').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id), checklistId };
  } catch (e) {
    return failure(e);
  }
}

/** Ticks or unticks a checklist step (a task): status done / open. The database stamps completed_at itself. */
export async function setStepDone(taskId: string, done: boolean): Promise<ActionResult> {
  if (isMock() || taskId.includes('-new-') || /^[a-z]\d$/.test(taskId)) return { ok: true };
  try {
    const { error } = await loose().from('tasks').update({ status: done ? 'done' : 'open' }).eq('id', taskId);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** "Log a sponsorship": public.log_sponsorship(), which saves the sponsorship and records the same amount as spending. */
export async function logSponsorship(input: {
  title: string;
  kind: 'conference' | 'travel' | 'fee' | 'other';
  students: number;
  amountCents: number;
  whenLabel: string;
  spentOn: string;
}): Promise<ActionResult<{ id: string }>> {
  if (isMock()) return { ok: true, id: localId('spons') };
  try {
    const { data, error } = await loose().rpc('log_sponsorship', {
      p_title: input.title,
      p_kind: input.kind,
      p_students: input.students,
      p_amount_cents: input.amountCents,
      p_when_label: input.whenLabel || null,
      p_spent_on: input.spentOn,
    });
    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      if (msg.includes('no_sponsorship_category')) return { ok: false, message: `Budget has no Sponsorships line for ${input.spentOn.slice(0, 4)} yet.` };
      throw error;
    }
    return { ok: true, id: String(data) };
  } catch (e) {
    return failure(e);
  }
}

/** "Share the application" on Mentorship: the schema has no table or function for mentor applications. */
export async function shareMentorApplication(): Promise<ActionResult> {
  return notConnected();
}

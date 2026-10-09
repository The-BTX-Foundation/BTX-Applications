'use client';

// The Programs pages' writes, called from the page components in the browser. Mock mode (no Supabase env): each action
// succeeds in memory and the component keeps the new row in its own state. Live mode calls the draft Ops Hub tables and
// functions as defined in the draft schema (NOT TESTED: needs the Ops Hub tables). Mentor pairings and sharing the
// mentor application have no table or function in the draft, so they answer "not connected yet".
import { failure, isMock, localId, loose, notConnected, type ActionResult } from './common';

/** "Add an idea" on Certifications: a row in `certification_ideas` (decision starts as not_decided). */
export async function addCertificationIdea(input: { programId?: string; name: string }): Promise<ActionResult<{ id: string }>> {
  if (isMock()) return { ok: true, id: localId('idea') };
  if (!input.programId) return { ok: false, message: 'Not connected yet.' };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const { data, error } = await loose().from('certification_ideas').insert({ program_id: input.programId, name: input.name }).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return failure(e);
  }
}

/** "Add a task" on a program page: a row in `tasks` under the Programs area (and the setup checklist when known). */
export async function addProgramTask(input: { title: string; checklistId?: string }): Promise<ActionResult<{ id: string }>> {
  if (isMock()) return { ok: true, id: localId('task') };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const row: Record<string, unknown> = { title: input.title, area: 'programs' };
    if (input.checklistId) row.checklist_id = input.checklistId;
    const { data, error } = await loose().from('tasks').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return failure(e);
  }
}

/** Ticks or unticks a checklist step (a task): status done / open. The database stamps completed_at itself. */
export async function setStepDone(taskId: string, done: boolean): Promise<ActionResult> {
  if (isMock() || taskId.includes('-new-') || /^[a-z]\d$/.test(taskId)) return { ok: true };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
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
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const { data, error } = await loose().rpc('log_sponsorship', {
      p_title: input.title,
      p_kind: input.kind,
      p_students: input.students,
      p_amount_cents: input.amountCents,
      p_when_label: input.whenLabel,
      p_spent_on: input.spentOn,
    });
    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      if (msg.includes('no_sponsorship_category')) return { ok: false, message: "Budget has no Sponsorships line for that year yet." };
      throw error;
    }
    return { ok: true, id: String(data) };
  } catch (e) {
    return failure(e);
  }
}

/** "Share the application" on Mentorship: the draft has no table or function for mentor applications. */
export async function shareMentorApplication(): Promise<ActionResult> {
  return notConnected();
}

/** Adding a mentor pairing: the draft has no table for pairings. */
export async function addMentorPairing(): Promise<ActionResult> {
  return notConnected();
}

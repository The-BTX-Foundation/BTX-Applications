'use client';

// The Mentorship page's one step write for LIVE mode (mock mode never calls it; the board changes its own state, like the
// demo). Row-level security decides who may write (admins and board members may update tasks); nothing here widens it.
// An update that row-level security filters out matches zero rows and returns no error, so the call asks for the changed
// row back and counts anything but exactly one row as a failure. The update is scoped to the step's id AND the checklist
// the page loaded (`checklist_id`), so a step moved to another checklist is never changed from here. A budget approval is
// never changed here: the update carries `type <> 'approval'`, so an approval matches zero rows and the write fails
// (approvals are decided only on /finance/budget/approval). Only the status is sent; the database trigger stamps
// completed_at from its own clock. The call gives up after 15 seconds (a hung request counts as a failed write).
//
// Undo is a guarded write: it also carries `status = <the status the tick set>`, so it changes the row only while nobody
// else has changed it since. Zero rows back WITHOUT an error on a guarded write reads as "changed by someone else" (the
// same person's tick on the same row was allowed moments before, so row-level security is not the likely cause); either
// way nothing was written, and the board refreshes to show the server's value. An error or a time-out is a failure.
// Chat sends use lib/chat-actions.ts postMessage unchanged (browser-made id, 23505 counts as saved).
import { getBrowserClient } from '@btx/data';
import type { MsWriteResult } from '@/lib/mentorship-map';
import type { TaskStatus } from '@/lib/mentorship-view';

type Rows = { data: { id: string }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => PromiseLike<T> };
/** An update with filters still being added (the slice of the Supabase builder the write uses). */
export type MsFilter = {
  eq: (c: string, v: string) => MsFilter;
  neq: (c: string, v: string) => MsFilter;
  select: (c: string) => Abortable<Rows>;
};
/** The slice of the Supabase client the step write uses (tests pass a stand-in). */
export type MsDb = { from: (t: string) => { update: (v: Record<string, unknown>) => MsFilter } };

/** How long one write may take. */
export const MS_WRITE_MS = 15_000;

/** One step write: the step, the checklist the page loaded, the status to set, and (Undo only) the status it must hold. */
export type MsStepWrite = { id: string; checklistId: string; status: TaskStatus; expect?: TaskStatus };

/**
 * Sets one step's status. 'ok' only when exactly that row changed; 'changed' when a guarded write (`expect`) matched no
 * row without an error; otherwise 'failed'.
 */
export async function setStepStatus(w: MsStepWrite, client: MsDb = getBrowserClient() as unknown as MsDb): Promise<MsWriteResult> {
  try {
    let q = client.from('tasks').update({ status: w.status }).eq('id', w.id).eq('checklist_id', w.checklistId);
    if (w.expect) q = q.eq('status', w.expect);
    const { data, error } = await q.neq('type', 'approval').select('id').abortSignal(AbortSignal.timeout(MS_WRITE_MS));
    if (error || !Array.isArray(data)) return 'failed';
    if (data.length === 1) return 'ok';
    return data.length === 0 && w.expect ? 'changed' : 'failed';
  } catch {
    return 'failed';
  }
}

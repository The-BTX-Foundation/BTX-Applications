'use client';

// The Certifications page's write actions for LIVE mode (mock mode never calls these; the page changes its own state,
// like the demo). Each returns true/false so the page can put things back and show "Couldn't save. Try again." when the
// database says no. Row-level security decides who may write; nothing here widens it. A write that RLS filters out
// matches zero rows and returns no error, so every call asks for the row back and counts anything but exactly one row as a
// failure. Every call gives up after 15 seconds.
// Inserts carry an id made in the browser: the page reuses a failed attempt's id for a retry within two minutes
// (lib/tasks-ids.ts), and "already exists" (23505) counts as saved, so a retry never makes a second copy.
import { getBrowserClient } from '@btx/data';
import { isDuplicate } from '@/lib/tasks-ids';
import type { CertStatus } from '@/lib/cert-view';

type Rows = { data: { id: string }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => PromiseLike<T> };
// A filter chain that ends in .select(): .eq(...).neq(...).select('id').
type Filter = { eq: (c: string, v: unknown) => Filter; neq: (c: string, v: unknown) => Filter; select: (c: string) => Abortable<Rows> };
type Loose = {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => { select: (c: string) => Abortable<Rows> };
    update: (v: Record<string, unknown>) => Filter;
  };
};
const db = () => getBrowserClient() as unknown as Loose;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(15_000);

/** True when exactly one row came back without an error. */
export const one = ({ data, error }: Rows) => !error && Array.isArray(data) && data.length === 1;

/** True when an insert saved: one row back, or "already exists" (an earlier try with the same id saved). */
export const inserted = (r: Rows) => one(r) || isDuplicate(r.error);

/**
 * Ticks or unticks a checklist step: tasks.status (the database stamps completed_at). Never an approval task: the update
 * is limited to `type <> 'approval'`, so an approval can only be decided on its own page.
 */
export async function setStepStatus(taskId: string, status: CertStatus): Promise<boolean> {
  try {
    return one(await db().from('tasks').update({ status }).eq('id', taskId).neq('type', 'approval').select('id').abortSignal(limit()));
  } catch {
    return false;
  }
}

/** "Add an idea": a certification_ideas row (decision starts as not decided; suggested_by is the signed-in person). */
export async function insertIdea(id: string, programId: string, name: string): Promise<boolean> {
  try {
    return inserted(await db().from('certification_ideas').insert({ id, program_id: programId, name }).select('id').abortSignal(limit()));
  } catch {
    return false;
  }
}

/** The program's setup checklist, made once when the program has none (the first "Add a task"). */
export async function insertChecklist(id: string, programId: string): Promise<boolean> {
  try {
    return inserted(await db().from('checklists').insert({ id, title: 'Setup checklist', area: 'programs', program_id: programId }).select('id').abortSignal(limit()));
  } catch {
    return false;
  }
}

/** "Add a task": a tasks row under the Programs area, on the setup checklist, after the last step. */
export async function insertTask(id: string, checklistId: string, title: string, position: number): Promise<boolean> {
  try {
    return inserted(await db().from('tasks').insert({ id, title, area: 'programs', position, checklist_id: checklistId }).select('id').abortSignal(limit()));
  } catch {
    return false;
  }
}

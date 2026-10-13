'use server';

// Write actions for the interview questions page (admins with admin rights; every board member reads). Each one runs as
// the signed-in person, so the database's row-level security applies. In mock mode (no Supabase env) the actions
// succeed and the page keeps the change in its own state, like the Figma preview.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '../supabase-server';
import type { Db } from '../pairing-db';
import { deleteQuestion, moveQuestion, saveQuestion, seedStarterQuestions } from '../interview-flow-db';

type Msg = { ok: boolean; message: string };
const db = async () => (await sessionClient()) as unknown as Db;
const FAILED = "That didn't save. Try again.";

/** Adds a question (no id) at the end of its group, or changes one's text. Returns the question's id. */
export async function saveInterviewQuestion(cycleId: string, q: { id?: string; criterionKey: string | null; text: string }): Promise<Msg & { id?: string }> {
  const text = q.text.trim();
  if (text === '') return { ok: false, message: 'Write the question first.' };
  if (text.length > 500) return { ok: false, message: 'Keep the question under 500 characters.' };
  if (!hasSupabaseEnv()) return { ok: true, message: 'Saved.', id: q.id };
  try {
    const r = await saveQuestion(await db(), cycleId, { ...q, text });
    return r.ok ? { ok: true, message: 'Saved.', id: r.id } : r;
  } catch {
    return { ok: false, message: FAILED };
  }
}

export async function removeInterviewQuestion(id: string): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Removed.' };
  try {
    const r = await deleteQuestion(await db(), id);
    return r.ok ? { ok: true, message: 'Removed.' } : r;
  } catch {
    return { ok: false, message: FAILED };
  }
}

/** Moves a question one place up or down inside its group. */
export async function moveInterviewQuestion(id: string, direction: 'up' | 'down'): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Moved.' };
  try {
    const r = await moveQuestion(await db(), id, direction);
    return r.ok ? { ok: true, message: 'Moved.' } : r;
  } catch {
    return { ok: false, message: FAILED };
  }
}

/** "Use the starter questions": adds the 12 starter questions when the cycle has none. */
export async function addStarterQuestions(cycleId: string): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Added the starter questions.' };
  try {
    const r = await seedStarterQuestions(await db(), cycleId);
    if (!r.ok) return r;
    return { ok: true, message: r.added === 0 ? 'This cycle already has questions.' : 'Added the starter questions.' };
  } catch {
    return { ok: false, message: FAILED };
  }
}

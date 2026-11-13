// Interview notes: the database calls, written against any signed-in Supabase client (like lib/pairing-db.ts), so the server
// action and the tests run the same code. Row-level security is the real gate (migration 20261113120000_interview_notes.sql):
// a person reads and writes a slot's notes only as one of its two interviewers or an admin, and writes only their own
// rows (author = the signer). Removing a question moves its notes into each author's overall notes (a database trigger).
// The checks here give a clear answer instead of a raw database error. Every call has a 15-second limit.
import type { SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

/** The most words one box holds (the table's check). */
export const NOTE_MAX = 10_000;
const LIMIT_MS = 15_000;
const signal = () => AbortSignal.timeout(LIMIT_MS);

/** One box's words: a question's notes, or the overall notes when `questionId` is null. */
export type NoteWrite = { slotId: string; questionId: string | null; authorId: string; body: string };

export type NoteSaveResult = { ok: true } | { ok: false; code: string };

const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : 'unknown');

// Updates the author's own row for this box. Answers how many rows came back (under RLS a refused update returns none).
async function updateOwn(client: Db, w: NoteWrite): Promise<{ rows: number; code: string | null }> {
  let q = client.from('interview_notes').update({ body: w.body }).eq('slot_id', w.slotId).eq('author_id', w.authorId);
  q = w.questionId === null ? q.is('question_id', null) : q.eq('question_id', w.questionId);
  const { data, error } = await q.select('id').abortSignal(signal());
  if (error) return { rows: 0, code: codeOf(error) };
  return { rows: (data ?? []).length, code: null };
}

/**
 * Saves the author's words for one box: update their row, or add it the first time. Safe to repeat (a retry after a
 * timeout that did save finds the row and writes the same words again). Two tabs adding the same box at once: the second
 * insert meets the unique index (23505) and updates instead. Exactly one row must come back, or it is not saved.
 */
export async function saveOwnNote(client: Db, w: NoteWrite): Promise<NoteSaveResult> {
  try {
    const body = w.body.slice(0, NOTE_MAX);
    const write = { ...w, body };
    const first = await updateOwn(client, write);
    if (first.code) return { ok: false, code: first.code };
    if (first.rows === 1) return { ok: true };
    if (first.rows > 1) return { ok: false, code: 'too_many_rows' };
    const ins = await client
      .from('interview_notes')
      .insert({ slot_id: w.slotId, question_id: w.questionId, author_id: w.authorId, body })
      .select('id')
      .abortSignal(signal());
    if (ins.error) {
      if (codeOf(ins.error) !== '23505') return { ok: false, code: codeOf(ins.error) };
      const again = await updateOwn(client, write);
      return again.rows === 1 ? { ok: true } : { ok: false, code: again.code ?? 'no_row' };
    }
    return (ins.data ?? []).length === 1 ? { ok: true } : { ok: false, code: 'no_row' };
  } catch (e) {
    // A timeout (AbortError) or a dropped connection: not saved, as far as anyone can tell.
    return { ok: false, code: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : codeOf(e) };
  }
}

/** The slot's cycle and its two interviewers (null when the slot or the pairing cannot be read). */
export async function readSlotAccess(client: Db, slotId: string): Promise<{ cycleId: string; pair: string[] } | null> {
  const [s, p] = await Promise.all([
    client.from('interview_slots').select('id, cycle_id').eq('id', slotId).abortSignal(signal()).maybeSingle(),
    client.from('interview_pairings').select('interviewer_a, interviewer_b').eq('slot_id', slotId).abortSignal(signal()).maybeSingle(),
  ]);
  if (s.error || p.error || !s.data) return null;
  const pair = p.data ? [String(p.data.interviewer_a), String(p.data.interviewer_b)] : [];
  return { cycleId: String(s.data.cycle_id), pair };
}

/** The question is one of this cycle's interview questions. */
export async function questionInCycle(client: Db, questionId: string, cycleId: string): Promise<boolean> {
  const r = await client.from('interview_questions').select('id').eq('id', questionId).eq('cycle_id', cycleId).abortSignal(signal()).maybeSingle();
  return !r.error && r.data !== null;
}

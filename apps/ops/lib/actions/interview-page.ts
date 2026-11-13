'use server';

// Write actions for the page for one interview (/scholarships/interviews/[slot]):
//   - saveInterviewNoteAction: the signed-in person's own words for one question's box, or the overall box. Only the
//     interview's two interviewers and admins (the page draws boxes for no one else); the database lets a person write only
//     their own rows (migration 20261113120000_interview_notes.sql). Safe to repeat.
//   - listReplacementsAction / changeInterviewerAction: admins only. Who is free to cover, then the change itself, through
//     lib/interview-reassign.ts (the contract shared with the Availability save). The change tells the incoming member.
// Every action checks the role from the auth server first (a hidden button is not a guard). Live mode only: in mock mode
// the page plays the story on the device and never calls these (they answer "not available" without Supabase env).
import { hasSupabaseEnv } from '@btx/data';
import { listFreeReplacements, reassignInterviewer, type ReplacementCandidate } from '../interview-reassign';
import { questionInCycle, readSlotAccess, saveOwnNote } from '../interview-notes-db';
import { sessionRole } from '../pairing-db';
import { BAD_INPUT, changeRefusal, cleanChange, cleanNote, NOTE_FAILED, noteRefusal } from '../interview-page-rules';
import { UUID } from '../interview-page-map';
import { sessionClient } from '../supabase-server';

export type NoteActionResult = { ok: true } | { ok: false; message: string };
export type ReplacementsResult = { ok: true; people: ReplacementCandidate[] } | { ok: false; message: string };
export type ChangeResult = { ok: true; incomingId: string; incomingName: string } | { ok: false; message: string };

const NO_MOCK = 'Not available in sample mode.';
const LIST_FAILED = "Couldn't check who is free. Try again.";
const CHANGE_FAILED = "Couldn't change the interviewer. Try again.";

/** Saves the signed-in person's own notes for one box of one interview. */
export async function saveInterviewNoteAction(input: { slotId: string; questionId: string | null; body: string }): Promise<NoteActionResult> {
  if (!hasSupabaseEnv()) return { ok: false, message: NO_MOCK };
  const note = cleanNote(input);
  if (!note) return { ok: false, message: BAD_INPUT };
  try {
    const client = await sessionClient();
    const who = await sessionRole(client);
    const access = await readSlotAccess(client, note.slotId);
    if (!access) return { ok: false, message: NOTE_FAILED };
    const refused = noteRefusal(who, access.pair);
    if (refused) return { ok: false, message: refused };
    if (note.questionId !== null && !(await questionInCycle(client, note.questionId, access.cycleId))) return { ok: false, message: BAD_INPUT };
    const r = await saveOwnNote(client, { slotId: note.slotId, questionId: note.questionId, authorId: who.id as string, body: note.body });
    if (!r.ok) {
      console.error('[interview-page] note save failed', { table: 'interview_notes', code: r.code });
      return { ok: false, message: NOTE_FAILED };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: NOTE_FAILED };
  }
}

/** Board members free for the whole interview time and not on it, least-loaded first. Admins only. */
export async function listReplacementsAction(slotId: string): Promise<ReplacementsResult> {
  if (!hasSupabaseEnv()) return { ok: false, message: NO_MOCK };
  if (typeof slotId !== 'string' || !UUID.test(slotId)) return { ok: false, message: LIST_FAILED };
  try {
    const client = await sessionClient();
    const refused = changeRefusal(await sessionRole(client));
    if (refused) return { ok: false, message: refused };
    return { ok: true, people: await listFreeReplacements(slotId) };
  } catch {
    return { ok: false, message: LIST_FAILED };
  }
}

/** Takes `outgoingId` off the interview and puts `incomingId` on it. Admins only; the server's own words come back. */
export async function changeInterviewerAction(input: { slotId: string; outgoingId: string; incomingId: string }): Promise<ChangeResult> {
  if (!hasSupabaseEnv()) return { ok: false, message: NO_MOCK };
  const change = cleanChange(input);
  if (!change) return { ok: false, message: CHANGE_FAILED };
  try {
    const client = await sessionClient();
    const refused = changeRefusal(await sessionRole(client));
    if (refused) return { ok: false, message: refused };
    const r = await reassignInterviewer({ ...change, why: 'covered_by_admin' });
    return r.ok ? { ok: true, incomingId: r.incomingId, incomingName: r.incomingName } : { ok: false, message: r.message || CHANGE_FAILED };
  } catch {
    return { ok: false, message: CHANGE_FAILED };
  }
}

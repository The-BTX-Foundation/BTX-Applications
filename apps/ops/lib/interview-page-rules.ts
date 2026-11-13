// Who may do what on the page for one interview, and the checks on what the browser sends. Pure, so the server action's
// permission checks are unit-tested (tests/interview-page-actions.test.ts). The database rules (row-level security) are the
// real gate; these give a clear answer first and refuse what the screen refuses.
import { NOTE_MAX } from './interview-notes-db';
import { UUID } from './interview-page-map';

/** The signed-in person: their id and the role in their session token ("admin", "board", ...). */
export type Who = { id: string | null; role: string | null };

export const NOT_STAFF = 'Only board members can do this.';
export const NOT_ADMIN = 'Only board members with admin rights can change an interviewer.';
export const NOT_ON_IT = "Only this interview's two interviewers and admins write notes here.";
export const BAD_INPUT = "That didn't save. Reload and try again.";
export const NOTE_FAILED = "Couldn't save. Try again.";

/** Why this person may not write notes on an interview with these two interviewers, or null when they may. */
export function noteRefusal(who: Who, pair: string[]): string | null {
  if (!who.id || (who.role !== 'admin' && who.role !== 'board')) return NOT_STAFF;
  if (who.role === 'admin' || pair.includes(who.id)) return null;
  return NOT_ON_IT;
}

/** Why this person may not change an interviewer, or null when they may (admins only). */
export function changeRefusal(who: Who): string | null {
  if (!who.id || (who.role !== 'admin' && who.role !== 'board')) return NOT_STAFF;
  return who.role === 'admin' ? null : NOT_ADMIN;
}

/** A note as the browser sent it, checked: real ids, a string, at most NOTE_MAX characters (cut, never refused). */
export function cleanNote(input: unknown): { slotId: string; questionId: string | null; body: string } | null {
  if (!input || typeof input !== 'object') return null;
  const { slotId, questionId, body } = input as Record<string, unknown>;
  if (typeof slotId !== 'string' || !UUID.test(slotId)) return null;
  if (questionId !== null && (typeof questionId !== 'string' || !UUID.test(questionId))) return null;
  if (typeof body !== 'string') return null;
  return { slotId, questionId, body: body.slice(0, NOTE_MAX) };
}

/** A change of interviewer as the browser sent it, checked. */
export function cleanChange(input: unknown): { slotId: string; outgoingId: string; incomingId: string } | null {
  if (!input || typeof input !== 'object') return null;
  const { slotId, outgoingId, incomingId } = input as Record<string, unknown>;
  const ok = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
  if (!ok(slotId) || !ok(outgoingId) || !ok(incomingId) || outgoingId === incomingId) return null;
  return { slotId, outgoingId, incomingId };
}

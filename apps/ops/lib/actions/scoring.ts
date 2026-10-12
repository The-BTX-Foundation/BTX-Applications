'use server';

// Write actions for Scholarships > Scoring: save a draft, publish, save a private note.
//
// Mock mode: kept in memory for the life of the server process (so a reload in the same session shows the draft).
// Live mode (tested live 2026-10-12 on the local stack as admin, board and reviewer: drafts, publish, a refused publish with
// missing criteria, a refused score on someone else's interview, a refused edit after publish, private notes): the Ops Hub tables, as the signed-in person, so the database rules decide:
//   - `scores` (application_id, scorer_id default auth.uid(), criteria jsonb, published): one row per (application,
//     scorer), so a draft and a publish are both an upsert. Only an interviewer of the application may insert; only the
//     scorer may change it, and only while it is a draft (D8: there is no un-publish in the app). The trigger
//     scores_check() fills criteria_count, weighted_score and published_at and refuses a publish until every criterion
//     is picked.
//   - `score_private_notes` (application_id, user_id default auth.uid(), note): upsert; only the writer reads it.
import { hasSupabaseEnv } from '@btx/data';
import { scoreErrorMessage } from '../sch-logic';
import { db } from '../sch-live';

type Result = { ok: boolean; message: string; savedAt?: string };

const MEMORY = {
  drafts: new Map<string, Record<string, number>>(),
  published: new Set<string>(),
  notes: new Map<string, string>(),
};

const nowLabel = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date());

// Only whole picks 1 to 5 go to the database.
function clean(picks: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(picks).filter(([k, v]) => /^[a-z_]{2,40}$/.test(k) && Number.isInteger(v) && v >= 1 && v <= 5));
}

// Writes the scorer's own row (insert the first time, update after). `published: true` publishes it.
async function upsertScore(applicationId: string, picks: Record<string, number>, published: boolean) {
  const client = await db();
  return client.from('scores').upsert({ application_id: applicationId, criteria: clean(picks), published }, { onConflict: 'application_id,scorer_id' });
}

// Saves the picks so far as a draft.
export async function saveDraft(applicationId: string, picks: Record<string, number>): Promise<Result> {
  if (!hasSupabaseEnv()) {
    if (MEMORY.published.has(applicationId)) return { ok: false, message: 'Already published.' };
    MEMORY.drafts.set(applicationId, picks);
    return { ok: true, message: 'Draft saved.', savedAt: nowLabel() };
  }
  const { error } = await upsertScore(applicationId, picks, false);
  return error ? { ok: false, message: scoreErrorMessage(error) } : { ok: true, message: 'Draft saved.', savedAt: nowLabel() };
}

// Publishes the score (every criterion picked: the database checks). Locks it.
export async function publishScore(applicationId: string, picks: Record<string, number>): Promise<Result> {
  if (!hasSupabaseEnv()) {
    if (Object.keys(picks).length < 6) return { ok: false, message: 'Publishing needs all six.' };
    MEMORY.drafts.set(applicationId, picks);
    MEMORY.published.add(applicationId);
    return { ok: true, message: 'Published.' };
  }
  const { error } = await upsertScore(applicationId, picks, true);
  return error ? { ok: false, message: scoreErrorMessage(error) } : { ok: true, message: 'Published.' };
}

// Saves the private note (only its writer ever sees it).
export async function savePrivateNote(applicationId: string, note: string): Promise<Result> {
  if (!hasSupabaseEnv()) {
    MEMORY.notes.set(applicationId, note);
    return { ok: true, message: 'Saved.' };
  }
  const client = await db();
  const { error } = await client.from('score_private_notes').upsert({ application_id: applicationId, note: note.slice(0, 10000) }, { onConflict: 'application_id,user_id' });
  return error ? { ok: false, message: "That note didn't save. Try again." } : { ok: true, message: 'Saved.' };
}

'use server';

// Write actions for Scholarships > Scoring: save a draft, publish, save a private note.
//
// Mock mode: kept in memory for the life of the server process (so a reload in the same session shows the draft).
// NOT TESTED, NEEDS THE OPS HUB TABLES: live mode calls the draft schema's tables exactly as defined in
// supabase/migrations/20261010120000_ops_hub.sql (branch db/ops-schema):
//   - `scores` (application_id, scorer_id default auth.uid(), criteria jsonb, published): the trigger scores_check()
//     fills criteria_count, weighted_score and published_at, and refuses a publish unless all six criteria are picked.
//     One row per (application_id, scorer_id), so a draft is an upsert and a publish is an update.
//   - `score_private_notes` (application_id, user_id default auth.uid(), note): upsert on (application_id, user_id).
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '../supabase-server';

type Result = { ok: boolean; message: string; savedAt?: string };
type Err = { message: string } | null;
// The generated types do not know the draft tables yet, so the calls below use this loose shape.
type Loose = {
  from: (t: string) => {
    upsert: (v: object, o?: { onConflict: string }) => PromiseLike<{ error: Err }>;
    update: (v: object) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => PromiseLike<{ error: Err }> } };
  };
};

const MEMORY = {
  drafts: new Map<string, Record<string, number>>(),
  published: new Set<string>(),
  notes: new Map<string, string>(),
};

const nowLabel = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date());

// Saves the picks so far as a draft.
export async function saveDraft(applicationId: string, picks: Record<string, number>): Promise<Result> {
  if (!hasSupabaseEnv()) {
    if (MEMORY.published.has(applicationId)) return { ok: false, message: 'Already published.' };
    MEMORY.drafts.set(applicationId, picks);
    return { ok: true, message: 'Draft saved.', savedAt: nowLabel() };
  }
  const client = (await sessionClient()) as unknown as Loose;
  const { error } = await client.from('scores').upsert({ application_id: applicationId, criteria: picks }, { onConflict: 'application_id,scorer_id' });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Draft saved.', savedAt: nowLabel() };
}

// Publishes the score (all six criteria picked). Locks it.
export async function publishScore(applicationId: string, picks: Record<string, number>): Promise<Result> {
  if (Object.keys(picks).length < 6) return { ok: false, message: 'Publishing needs all six.' };
  if (!hasSupabaseEnv()) {
    MEMORY.drafts.set(applicationId, picks);
    MEMORY.published.add(applicationId);
    return { ok: true, message: 'Published.' };
  }
  const client = (await sessionClient()) as unknown as Loose;
  const saved = await client.from('scores').upsert({ application_id: applicationId, criteria: picks }, { onConflict: 'application_id,scorer_id' });
  if (saved.error) return { ok: false, message: saved.error.message };
  const who = (await (await sessionClient()).auth.getUser()).data.user?.id ?? '';
  const done = await client.from('scores').update({ published: true }).eq('application_id', applicationId).eq('scorer_id', who);
  return done.error ? { ok: false, message: done.error.message } : { ok: true, message: 'Published.' };
}

// Saves the private note (only its writer ever sees it).
export async function savePrivateNote(applicationId: string, note: string): Promise<Result> {
  if (!hasSupabaseEnv()) {
    MEMORY.notes.set(applicationId, note);
    return { ok: true, message: 'Saved.' };
  }
  const client = (await sessionClient()) as unknown as Loose;
  const { error } = await client.from('score_private_notes').upsert({ application_id: applicationId, note }, { onConflict: 'application_id,user_id' });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Saved.' };
}

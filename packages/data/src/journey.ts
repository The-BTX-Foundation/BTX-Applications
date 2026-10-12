// The database calls behind the screens after she submits, written exactly against the journey migration
// (supabase/migrations/20261010130000_portal_journey.sql on db/ops-schema; drafted, not applied):
//   open_interview_slots(p_cycle_id)   the future slots nobody holds
//   my_interview(p_cycle_id)           her own booking with interviewers and the video link, or null
//   my_decision(p_cycle_id)            her result, or null until the decisions are released
//   interview_free_times               her answer to "None of these times work" (one row per application)
//   award_stories + bucket award-photos   the winner's photo and story
// NOT TESTED AGAINST LIVE DATA: unit-tested with stand-in clients only.
import type { BtxClient } from './client';
import type { Json } from './database.types';

// ---- open times ------------------------------------------------------------------------------------------------

export type OpenSlot = { id: string; startsAt: string; endsAt: string };

/** The cycle's open times, or null when the read failed. */
export async function fetchOpenSlots(client: BtxClient, cycleId: string): Promise<OpenSlot[] | null> {
  const { data, error } = await client.rpc('open_interview_slots', { p_cycle_id: cycleId });
  if (error) return null;
  return (data ?? []).map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at }));
}

// ---- her interview ---------------------------------------------------------------------------------------------

export type MyInterview = { slotId: string; startsAt: string; endsAt: string; interviewers: string[]; videoUrl: string | null };

const obj = (j: Json | undefined): Record<string, Json> | null => (j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, Json>) : null);
const str = (j: Json | undefined): string | null => (typeof j === 'string' ? j : null);

/** Reads my_interview's JSON. null when she holds no time. */
export function parseInterview(json: Json | undefined): MyInterview | null {
  const o = obj(json);
  const slotId = str(o?.slotId);
  const startsAt = str(o?.startsAt);
  const endsAt = str(o?.endsAt);
  if (!o || !slotId || !startsAt || !endsAt) return null;
  const names = Array.isArray(o.interviewers) ? o.interviewers.filter((n): n is string => typeof n === 'string') : [];
  return { slotId, startsAt, endsAt, interviewers: names, videoUrl: str(o.videoUrl) };
}

/** `{ failed }` when the read failed; otherwise her interview or null. */
export async function fetchMyInterview(client: BtxClient, cycleId: string): Promise<{ failed: boolean; interview: MyInterview | null }> {
  const { data, error } = await client.rpc('my_interview', { p_cycle_id: cycleId });
  if (error) return { failed: true, interview: null };
  return { failed: false, interview: parseInterview(data) };
}

// ---- her decision ----------------------------------------------------------------------------------------------

export type MyDecision =
  | { kind: 'won'; awardId: string; awardName: string | null; amountCents: number | null; storySent: boolean }
  | { kind: 'not-picked' };

/** Reads my_decision's JSON. null until an admin releases the decisions (and when she has no submitted application). */
export function parseDecision(json: Json | undefined): MyDecision | null {
  const o = obj(json);
  if (!o) return null;
  if (o.kind === 'not-picked') return { kind: 'not-picked' };
  if (o.kind === 'won' && typeof o.awardId === 'string') {
    return {
      kind: 'won',
      awardId: o.awardId,
      awardName: str(o.awardName),
      amountCents: typeof o.amountCents === 'number' ? o.amountCents : null,
      storySent: o.storySent === true,
    };
  }
  return null;
}

export async function fetchMyDecision(client: BtxClient, cycleId: string): Promise<{ failed: boolean; decision: MyDecision | null }> {
  const { data, error } = await client.rpc('my_decision', { p_cycle_id: cycleId });
  if (error) return { failed: true, decision: null };
  return { failed: false, decision: parseDecision(data) };
}

// ---- "None of these times work" --------------------------------------------------------------------------------

export type FreeTimesRow = { days: string[]; windows: string[]; note: string };

export async function fetchFreeTimes(client: BtxClient, applicationId: string): Promise<{ failed: boolean; row: FreeTimesRow | null }> {
  const { data, error } = await client.from('interview_free_times').select('days, windows, note').eq('application_id', applicationId).maybeSingle();
  if (error) return { failed: true, row: null };
  return { failed: false, row: data ? { days: data.days, windows: data.windows, note: data.note ?? '' } : null };
}

/** Saves (adds or changes) her answer. days are Mon..Sun, windows are morning, afternoon or evening. */
export async function saveFreeTimes(client: BtxClient, applicationId: string, v: FreeTimesRow): Promise<{ ok: boolean }> {
  const note = v.note.trim();
  const { error } = await client
    .from('interview_free_times')
    .upsert({ application_id: applicationId, days: v.days, windows: v.windows, note: note || null }, { onConflict: 'application_id' });
  return { ok: !error };
}

// ---- photo and story -------------------------------------------------------------------------------------------

export const PHOTO_BUCKET = 'award-photos';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type StoryRow = { story: string; photoPath: string | null; consent: boolean; sentAt: string | null };

export async function fetchStory(client: BtxClient, awardId: string): Promise<{ failed: boolean; row: StoryRow | null }> {
  const { data, error } = await client.from('award_stories').select('story, photo_path, consent, sent_at').eq('award_id', awardId).maybeSingle();
  if (error) return { failed: true, row: null };
  return { failed: false, row: data ? { story: data.story ?? '', photoPath: data.photo_path, consent: data.consent, sentAt: data.sent_at } : null };
}

/** `{userId}/{awardId}/photo.jpg` or `photo.png`. */
export function photoPath(userId: string, awardId: string, mime: string): string {
  return `${userId}/${awardId}/photo.${mime === 'image/png' ? 'png' : 'jpg'}`;
}

/** Stores the photo (replacing a photo of the other type) and returns its path, or null when the upload failed. */
export async function uploadAwardPhoto(
  client: BtxClient,
  userId: string,
  awardId: string,
  file: Blob & { type: string },
  previousPath?: string | null,
): Promise<string | null> {
  const path = photoPath(userId, awardId, file.type);
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) return null;
  if (previousPath && previousPath !== path) await client.storage.from(PHOTO_BUCKET).remove([previousPath]);
  return path;
}

/** A link to the private photo, good for an hour. */
export async function photoUrl(client: BtxClient, path: string): Promise<string | null> {
  const { data } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Saves the story row. `sentAt` is set only by "Send to BTX" (the database wants a photo, a story and consent then). */
export async function saveStory(
  client: BtxClient,
  awardId: string,
  v: { story: string; photoPath: string | null; consent: boolean; sentAt?: string },
): Promise<{ ok: boolean }> {
  const { error } = await client.from('award_stories').upsert(
    { award_id: awardId, story: v.story.trim() || null, photo_path: v.photoPath, consent: v.consent, ...(v.sentAt ? { sent_at: v.sentAt } : {}) },
    { onConflict: 'award_id' },
  );
  return { ok: !error };
}

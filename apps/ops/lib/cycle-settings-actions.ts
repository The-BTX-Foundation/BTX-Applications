'use server';

// The Cycle settings page's live writes (components/cycle-settings/cycle-settings-board.tsx calls them through
// cycle-settings-writes.ts, which gives up after 15 seconds). Admin only: every action re-reads the caller's role from the
// auth server (never from anything the browser sent), and the database's cycles_update_admin rule is the second lock.
// - saveCycleFields: one setting (or the requirements list). It accepts only the settings drawn on the page
//   (lib/cycle-settings-merge.ts readPatch), reads the cycle as it is now (with its updated_at), answers success at once
//   when the row already holds the change (a repeated save), refuses when a field the page last saw has changed since
//   (so a stale page can't overwrite another admin's field), runs the page's rules on the merged result (validateForm,
//   the date order, a published cycle keeps its four student-facing settings), then writes ONLY the changed columns in
//   one UPDATE that also matches the updated_at it read (the cycles_touch trigger moves it on every write), so a change
//   that lands in between makes the UPDATE match no row. Undo is the same call with the earlier value.
// - publishCycleNow / unpublishCycleNow: flip the status only (never the settings). Publish also runs validateForm on the
//   row (a draft whose dates are out of order stays a draft). Unpublish is refused once applications have opened
//   (students may have started one: staff can only see submitted applications) and whenever any submitted application
//   exists. Nothing here emails anyone or touches applications.
// Each answer carries the saved row, so the page shows what the server holds. Mock mode (no Supabase env) never calls these.
import { revalidatePath } from 'next/cache';
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { canPublish, canUnpublish, missingForPublish, rowToForm, validateForm, type CycleRow, type FieldErrors } from './cycle-settings';
import { NOT_ALLOWED, planFieldSave, readPatch } from './cycle-settings-merge';
import { hasOpened } from './cycle-settings-rows';

/** A write's answer: the cycle as saved, or a plain sentence (with the field it is about, and `stale` when the page is behind). */
export type FieldsResult = { ok: true; row: CycleRow } | { ok: false; message: string; stale?: boolean; errors?: FieldErrors };

const COLUMNS =
  'id, term, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end, decision_date, next_cycle_month, requirements, photo_due, payment_note, event_enabled, event_at, updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DENIED = 'Only board members with admin rights can change cycle settings.';
const SIGNED_OUT = 'Sign in again to change cycle settings.';
const GONE = "That cycle isn't there any more.";
const FAILED = "That didn't save. Try again.";
const RULE = "That change breaks a cycle rule. Reload to see the latest.";
const ANOTHER = 'Another cycle is already published, and only one can be published at a time.';
const NO_LIVE = 'Cycle settings are not connected here.';
const CHANGED = 'This cycle changed while you were editing. Reload and try again.';
const OPENED = 'Applications are already open, so this cycle stays published. To stop early, move the deadline.';
const SUBMITTED = 'Students have submitted applications, so this cycle stays published. To stop early, move the deadline.';

type Client = Awaited<ReturnType<typeof sessionClient>>;
type DbError = { code?: string } | null;
/** The cycle as read here: the row plus the updated_at the save's UPDATE must still match. */
type ReadRow = CycleRow & { updated_at: string };

// The signed-in admin's client, or the sentence to show. The role comes from the auth server.
async function admin(): Promise<{ ok: true; client: Client } | { ok: false; message: string }> {
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) return { ok: false, message: SIGNED_OUT };
  if (data.user.app_metadata?.role !== 'admin') return { ok: false, message: DENIED };
  return { ok: true, client };
}

// The cycle as it is now (null when it is gone).
async function current(client: Client, id: string): Promise<ReadRow | null> {
  const { data, error } = await client.from('cycles').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ReadRow | null) ?? null;
}

// The answer to an UPDATE that should bring back exactly one row. The caller was checked as an admin just before, and
// the UPDATE matched the status (and, for a save, the updated_at) it read, so zero rows means the cycle changed, or was
// published or unpublished, in between.
function oneRow(data: unknown, error: DbError, onCode: Record<string, string> = {}): FieldsResult {
  if (error) {
    const msg = error.code ? onCode[error.code] : undefined;
    if (msg) return { ok: false, message: msg };
    console.error('[cycle-settings] write failed', { table: 'cycles', code: error.code ?? 'unknown' });
    return { ok: false, message: FAILED };
  }
  const rows = Array.isArray(data) ? (data as CycleRow[]) : [];
  if (rows.length === 0) return { ok: false, message: CHANGED };
  if (rows.length !== 1) return { ok: false, message: FAILED };
  revalidatePath('/scholarships/cycle/settings');
  revalidatePath('/scholarships/cycle');
  return { ok: true, row: rows[0] };
}

// A read or write that threw: one server line with the code only, a plain sentence for the page.
function failed(e: unknown): FieldsResult {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : 'unknown';
  console.error('[cycle-settings] write failed', { table: 'cycles', code });
  return { ok: false, message: FAILED };
}

/**
 * Saves some settings of one cycle. `patch` holds the new values, `before` the values the page showed for the same
 * fields (both form-shaped: lib/cycle-settings CycleForm keys). Admin only; see the file note for every check.
 */
export async function saveCycleFields(id: unknown, patch: unknown, before: unknown): Promise<FieldsResult> {
  if (!hasSupabaseEnv()) return { ok: false, message: NO_LIVE };
  const p = readPatch(patch);
  const b = readPatch(before);
  if (typeof id !== 'string' || !UUID.test(id) || !p || !b) return { ok: false, message: NOT_ALLOWED };
  const who = await admin();
  if (!who.ok) return who;
  try {
    const cur = await current(who.client, id);
    if (!cur) return { ok: false, message: GONE };
    const plan = planFieldSave(cur, p, b);
    if (!plan.ok) return plan;
    if (Object.keys(plan.columns).length === 0) return { ok: true, row: cur };
    // One UPDATE of only the changed columns, only while the cycle is exactly as read (same status, same updated_at).
    const { data, error } = await who.client
      .from('cycles')
      .update(plan.columns)
      .eq('id', id)
      .eq('status', cur.status)
      .eq('updated_at', cur.updated_at)
      .select(COLUMNS);
    return oneRow(data, error, { '23514': RULE });
  } catch (e) {
    return failed(e);
  }
}

/** "Publish": a draft with every required setting becomes the published cycle (only one can be). Status only. */
export async function publishCycleNow(id: unknown): Promise<FieldsResult> {
  if (!hasSupabaseEnv()) return { ok: false, message: NO_LIVE };
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, message: NOT_ALLOWED };
  const who = await admin();
  if (!who.ok) return who;
  try {
    const cur = await current(who.client, id);
    if (!cur) return { ok: false, message: GONE };
    const { data: other, error: e1 } = await who.client.from('cycles').select('term').eq('status', 'published').neq('id', id).limit(1);
    if (e1) throw e1;
    const otherTerm = Array.isArray(other) && other[0] ? String((other[0] as { term: unknown }).term) : null;
    const form = rowToForm(cur);
    const rule = canPublish({ status: cur.status, missing: missingForPublish(form), otherPublishedTerm: otherTerm });
    if (!rule.ok) return { ok: false, message: rule.message };
    // The whole cycle's rules too (a draft can hold dates out of order: each save only refuses its own new problems).
    const errors = validateForm(form);
    const first = Object.values(errors)[0];
    if (first) return { ok: false, message: `Fix this first: ${first}`, errors };
    const { data, error } = await who.client.from('cycles').update({ status: 'published' }).eq('id', id).eq('status', 'draft').select(COLUMNS);
    return oneRow(data, error, { '23505': ANOTHER, '23514': RULE });
  } catch (e) {
    return failed(e);
  }
}

/**
 * "Unpublish": back to a draft, only before applications open and while no application has been submitted. Staff can
 * read only submitted applications (row-level security), so once the open time has passed a student may have started
 * one that this count can't see: from that moment it is refused whatever the count says. Status only.
 */
export async function unpublishCycleNow(id: unknown): Promise<FieldsResult> {
  if (!hasSupabaseEnv()) return { ok: false, message: NO_LIVE };
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, message: NOT_ALLOWED };
  const who = await admin();
  if (!who.ok) return who;
  try {
    const cur = await current(who.client, id);
    if (!cur) return { ok: false, message: GONE };
    const rule = canUnpublish({ status: cur.status, applications: 0 });
    if (!rule.ok) return { ok: false, message: rule.message };
    if (hasOpened(cur.opens_at, Date.now())) return { ok: false, message: OPENED };
    // Submitted applications in the cycle (the only ones staff can read).
    const { count, error: e1 } = await who.client.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', id);
    if (e1) throw e1;
    if (count === null || count > 0) return { ok: false, message: count === null ? FAILED : SUBMITTED };
    const { data, error } = await who.client.from('cycles').update({ status: 'draft' }).eq('id', id).eq('status', 'published').select(COLUMNS);
    return oneRow(data, error);
  } catch (e) {
    return failed(e);
  }
}

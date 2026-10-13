'use server';

// The Cycle settings writes: save, publish, unpublish. Admin only: the database's cycles_update_admin rule is the real
// lock, and each action also checks the role first so a board member gets a plain sentence. In mock mode (no Supabase
// env) every action says it worked and nothing is saved.
import { revalidatePath } from 'next/cache';
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '@/lib/supabase-server';
import { canPublish, canUnpublish, formToColumns, missingForPublish, validateForm, type CycleForm, type FieldErrors } from '@/lib/cycle-settings';

export type SaveResult = { ok: true; status: string } | { ok: false; message: string; errors?: FieldErrors };

const DENIED = 'Only board members with admin rights can change cycle settings.';
const FAILED = "That didn't save. Try again.";

function done() {
  revalidatePath('/scholarships/cycle/settings');
  revalidatePath('/scholarships/cycle');
}

// Confirms the caller is an admin and returns the client, or a message to show.
async function adminClient() {
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  if (data.user?.app_metadata?.role !== 'admin') return { client: null, error: DENIED };
  return { client, error: null };
}

// Saves the form onto a cycle. `publish` also flips a draft to published (needs every required setting).
// A published cycle is always checked as if publishing, because students see the change the moment it saves.
async function write(id: string, form: CycleForm, publish: boolean): Promise<SaveResult> {
  if (!hasSupabaseEnv()) return { ok: true, status: publish ? 'published' : 'draft' };
  const auth = await adminClient();
  if (!auth.client) return { ok: false, message: auth.error ?? DENIED };
  const { client } = auth;
  try {
    const errors = validateForm(form);
    if (Object.keys(errors).length) return { ok: false, message: 'Fix the highlighted fields first.', errors };
    const { data: cur, error: e0 } = await client.from('cycles').select('status').eq('id', id).maybeSingle();
    if (e0) throw e0;
    if (!cur) return { ok: false, message: "That cycle isn't there any more." };
    if (cur.status === 'archived') return { ok: false, message: 'An archived cycle can not be changed.' };
    const missing = missingForPublish(form);
    if ((publish || cur.status === 'published') && missing.length) {
      return { ok: false, message: `Fill in ${missing.map((m) => m.label.toLowerCase()).join(', ')} first.` };
    }
    let status = cur.status as string;
    if (publish && cur.status !== 'published') {
      const { data: other } = await client.from('cycles').select('term').eq('status', 'published').neq('id', id).maybeSingle();
      const rule = canPublish({ status: cur.status, missing, otherPublishedTerm: other?.term ?? null });
      if (!rule.ok) return { ok: false, message: rule.message };
      status = 'published';
    }
    const { data, error } = await client.from('cycles').update({ ...formToColumns(form), status }).eq('id', id).select('id');
    if (error) {
      // the database allows only one published cycle at a time (a unique index)
      if (error.code === '23505') return { ok: false, message: 'Another cycle is already published, and only one can be published at a time.' };
      throw error;
    }
    // row-level security answers "no rows" instead of an error when the caller is not allowed to update
    if (!data?.length) return { ok: false, message: DENIED };
    done();
    return { ok: true, status };
  } catch {
    return { ok: false, message: FAILED };
  }
}

/** "Save draft" (draft cycle) or "Save changes" (published cycle: goes live at once). */
export async function saveCycle(id: string, form: CycleForm): Promise<SaveResult> {
  return write(id, form, false);
}

/** "Publish": saves the form and makes the cycle visible to students. */
export async function publishCycle(id: string, form: CycleForm): Promise<SaveResult> {
  return write(id, form, true);
}

/** "Unpublish": back to a draft, only while no application has been started. */
export async function unpublishCycle(id: string): Promise<SaveResult> {
  if (!hasSupabaseEnv()) return { ok: true, status: 'draft' };
  const auth = await adminClient();
  if (!auth.client) return { ok: false, message: auth.error ?? DENIED };
  const { client } = auth;
  try {
    const { data: cur, error: e0 } = await client.from('cycles').select('status').eq('id', id).maybeSingle();
    if (e0) throw e0;
    if (!cur) return { ok: false, message: "That cycle isn't there any more." };
    const { count, error: e1 } = await client.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', id);
    if (e1) throw e1;
    const rule = canUnpublish({ status: cur.status, applications: count ?? 0 });
    if (!rule.ok) return { ok: false, message: rule.message };
    const { data, error } = await client.from('cycles').update({ status: 'draft' }).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) return { ok: false, message: DENIED };
    done();
    return { ok: true, status: 'draft' };
  } catch {
    return { ok: false, message: FAILED };
  }
}

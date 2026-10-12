'use client';

// The Outreach pages' writes, called from the page components in the browser. Mock mode (no Supabase env): each action
// succeeds in memory and the component keeps the new row in its own state. Live mode writes the Ops Hub tables as the
// signed-in person (admin or board; tested live). Past issues stay out (O14), so that answers "not connected yet".
import { failure, isMock, localId, loose, notConnected, type ActionResult } from './common';

/** "Add a channel" on Plan: a row in `outreach_channels` (status starts as not_started). */
export async function addChannel(input: { name: string; kind?: 'instagram' | 'newsletter' | 'linkedin' | 'campus_events' | 'other'; position?: number }): Promise<ActionResult<{ id: string }>> {
  if (isMock()) return { ok: true, id: localId('channel') };
  try {
    const { data, error } = await loose().from('outreach_channels').insert({ name: input.name, kind: input.kind ?? 'other', position: input.position ?? 0 }).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return failure(e);
  }
}

/** "Add a post" / "Plan November": a row in `posts` on the Instagram channel. */
export async function addPost(input: { channelId?: string; title: string; postOn: string | null; ownerId?: string }): Promise<ActionResult<{ id: string }>> {
  if (isMock()) return { ok: true, id: localId('post') };
  if (!input.channelId) return notConnected();
  try {
    const row: Record<string, unknown> = { channel_id: input.channelId, title: input.title, post_on: input.postOn };
    if (input.ownerId) row.owner_id = input.ownerId;
    const { data, error } = await loose().from('posts').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return failure(e);
  }
}

/** "Send for approval": the post's status becomes awaiting_approval (the board member sees it as a Today approval). */
export async function sendPostForApproval(postId: string): Promise<ActionResult> {
  if (isMock() || postId.includes('-new-') || /^p\d$/.test(postId)) return { ok: true };
  try {
    const { error } = await loose().from('posts').update({ status: 'awaiting_approval' }).eq('id', postId);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Ticks or unticks a newsletter section: newsletter_sections.status done / writing. */
export async function setSectionDone(sectionId: string, done: boolean): Promise<ActionResult> {
  if (isMock() || /^n\d$/.test(sectionId)) return { ok: true };
  try {
    const { error } = await loose().from('newsletter_sections').update({ status: done ? 'done' : 'not_started' }).eq('id', sectionId);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** "Past issues" on Newsletter: no screen or query for sent issues in the draft plan yet. */
export async function showPastIssues(): Promise<ActionResult> {
  return notConnected();
}

// The Instagram page's two live writes, called from the browser (components/instagram/instagram-board.tsx), as the
// signed-in person (row-level security applies). Nothing here posts to Instagram: these change rows in `posts` only.
//
// - Add a post: inserts the row with an id made in the browser. A retry of the same words within two minutes reuses that
//   id (lib/tasks-ids.ts), and "already exists" (23505) counts as saved, so a request that saved but lost its answer never
//   makes a twin.
// - Mark a post as waiting for approval: sets status to awaiting_approval on one post that has a caption and a photo and
//   is not past approval yet. Nobody is notified (no message, push or email is sent). Sending twice is safe (the same
//   status again). Exactly one row must change: no row means the post moved on (someone approved or posted it).
//
// Every request gives up after 15 seconds. The client is passed in so tests can stand in.
import { getBrowserClient } from '@btx/data';
import { isDuplicate, retryIds } from './tasks-ids';
import type { SendResult } from './instagram-flow';

type Res = { data: { id: unknown }[] | null; error: unknown };
type Abortable = { abortSignal: (s: AbortSignal) => PromiseLike<Res> };
type Filter = {
  eq: (c: string, v: unknown) => Filter;
  in: (c: string, v: unknown[]) => Filter;
  neq: (c: string, v: unknown) => Filter;
  not: (c: string, op: string, v: unknown) => Filter;
  select: (c: string) => Abortable;
};

/** The parts of the browser client these calls use. */
export type IgWriteClient = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => { select: (c: string) => Abortable };
    update: (vals: Record<string, unknown>) => Filter;
  };
};

/** The signed-in person's browser client, typed loosely (the Ops Hub tables are not in the generated types). */
export const browserIgClient = () => getBrowserClient() as unknown as IgWriteClient;

/** One request's time limit. */
export const WRITE_MS = 15_000;
const limit = () => AbortSignal.timeout(WRITE_MS);

/** The statuses a post can be sent for approval from (awaiting_approval too, so a repeat is harmless). */
export const SENDABLE = ['not_started', 'drafting', 'awaiting_approval'];

/** A new post as the page sends it. */
export type NewPost = { channelId: string; title: string; postOn: string | null; ownerId: string | null };

/** The retry key: the same words, day, owner and person. */
export const postKey = (p: NewPost, me: string | null) => `${p.channelId}|${p.title}|${p.postOn ?? ''}|${p.ownerId ?? ''}|${me ?? ''}`;

// One retry memory for the page (module level, so it outlives a re-render or a refresh).
const ids = retryIds();

/** Inserts one post with this id. True when exactly one row came back, or the row already exists (an earlier try saved). */
export async function insertPostOnce(id: string, p: NewPost, client: IgWriteClient = browserIgClient()): Promise<boolean> {
  try {
    const row: Record<string, unknown> = { id, channel_id: p.channelId, title: p.title, post_on: p.postOn };
    if (p.ownerId) row.owner_id = p.ownerId;
    const { data, error } = await client.from('posts').insert(row).select('id').abortSignal(limit());
    if (error) return isDuplicate(error);
    return Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

/**
 * Adds a post. A new add reuses a failed try's id for two minutes (the same words typed again); a "Not added" row's Try
 * again passes the id that row's last try used (`retryId`), of any age, so a save whose answer was lost never makes a
 * twin. Returns the id it tried and whether it saved: a failed try's id is kept with its words, so if the save went
 * through after all and the server lists that id, the error clears.
 */
export async function addPost(p: NewPost, me: string | null, client: IgWriteClient = browserIgClient(), now = Date.now(), memory = ids, retryId?: string): Promise<{ id: string; ok: boolean }> {
  const key = postKey(p, me);
  const id = retryId ?? memory.take(key, now);
  const ok = await insertPostOnce(id, p, client);
  if (ok) memory.done(key);
  else memory.fail(key, id, now);
  return { id, ok };
}

/** Forgets retry ids the server now lists (the same words typed again on purpose are a new post). */
export const forgetPostIds = (seen: Iterable<string>) => ids.forget(seen);

/** Marks one post as waiting for approval: 'ok' when exactly one row changed, 'moved' when none matched, else 'failed'. */
export async function sendForApproval(id: string, client: IgWriteClient = browserIgClient()): Promise<SendResult> {
  try {
    const { data, error } = await client
      .from('posts')
      .update({ status: 'awaiting_approval' })
      .eq('id', id)
      .in('status', SENDABLE)
      .not('caption', 'is', null)
      .neq('caption', '')
      .not('image_path', 'is', null)
      .neq('image_path', '')
      .select('id')
      .abortSignal(limit());
    if (error || !Array.isArray(data)) return 'failed';
    return data.length === 1 ? 'ok' : data.length === 0 ? 'moved' : 'failed';
  } catch {
    return 'failed';
  }
}

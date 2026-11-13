'use client';

// The Outreach Plan page's one write, for LIVE mode (mock mode never calls it; the page changes its own state, like the
// demo): "Plan a post or issue" adds a post on the Instagram channel. It returns true/false so the page can take the row
// off and show "Couldn't save. Try again." when the database says no. Row-level security decides who may write; nothing
// here widens it. A write that RLS filters out returns no row and no error, so the call asks for the row back and counts
// anything but exactly one row as a failure. It gives up after 15 seconds.
// The insert carries an id made in the browser: the page reuses a failed attempt's id for a retry within two minutes
// (lib/tasks-ids.ts), and "already exists" (23505) counts as saved, so a retry never makes a second post.
import { getBrowserClient } from '@btx/data';
import { isDuplicate } from '@/lib/tasks-ids';

type Rows = { data: { id: string }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => PromiseLike<T> };

/** The slice of the database client this file uses (tests pass a stand-in). */
export type PnDb = { from: (t: string) => { insert: (v: Record<string, unknown>) => { select: (c: string) => Abortable<Rows> } } };

const db = () => getBrowserClient() as unknown as PnDb;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(15_000);

/** True when exactly one row came back without an error. */
export const one = ({ data, error }: Rows) => !error && Array.isArray(data) && data.length === 1;

/** True when an insert saved: one row back, or "already exists" (an earlier try with the same id saved). */
export const inserted = (r: Rows) => one(r) || isDuplicate(r.error);

/** The new post's fields. `postOn` is a calendar day or null; `ownerId` is a person id or null. */
export type NewPost = { id: string; channelId: string; title: string; postOn: string | null; ownerId: string | null };

/** "Plan a post or issue" (live): a posts row (status starts as not started; created_by is the signed-in person). */
export async function insertPost(p: NewPost, client: PnDb = db()): Promise<boolean> {
  try {
    const row: Record<string, unknown> = { id: p.id, channel_id: p.channelId, title: p.title, post_on: p.postOn };
    if (p.ownerId) row.owner_id = p.ownerId;
    return inserted(await client.from('posts').insert(row).select('id').abortSignal(limit()));
  } catch {
    return false;
  }
}

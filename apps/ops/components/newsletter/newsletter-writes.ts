'use client';

// The Newsletter page's one write for LIVE mode (mock mode never calls it; the board changes its own state, like the demo):
// a section's status. Row-level security decides who may write (admins and board members may update newsletter_sections);
// nothing here widens it. An update that row-level security filters out matches zero rows and returns no error, so the call
// asks for the changed row back and counts anything but exactly one row as a failure. Only the status is sent (the trigger
// stamps updated_at). Writing the same status twice is harmless, so a retry after a timeout that did save is safe.
// The call gives up after 15 seconds (a hung request counts as a failed write, so the page rolls back).
// Nothing in this file (or on this page) sends the newsletter or emails anyone.
import { getBrowserClient } from '@btx/data';
import type { NlStatus } from '@/lib/newsletter-view';

type Rows = { data: { id: string }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => PromiseLike<T> };
/** The slice of the Supabase client the section write uses (tests pass a stand-in). */
export type NlDb = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { select: (c: string) => Abortable<Rows> } };
  };
};

/** How long one write may take. */
export const NL_WRITE_MS = 15_000;

/** Sets one section's status ('done' on a tick; its earlier open status on an untick or an Undo). True only when exactly that row changed. */
export async function setSectionStatus(id: string, status: NlStatus, client: NlDb = getBrowserClient() as unknown as NlDb): Promise<boolean> {
  try {
    const { data, error } = await client.from('newsletter_sections').update({ status }).eq('id', id).select('id').abortSignal(AbortSignal.timeout(NL_WRITE_MS));
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

// Submitting the application: the database function submit_application checks everything and returns the
// application number. Its errors are plain words in the message, mapped here to what the screen should say.
import type { BtxClient } from './client';

export type SubmitResult =
  | { ok: true; code: string }
  | { ok: false; kind: 'terpmail_required' | 'cycle_closed' | 'missing_files' | 'not_agreed' | 'not_found' | 'network' | 'unknown' }
  | { ok: false; kind: 'missing_answers'; columns: string[] };

export async function submitApplication(client: BtxClient, applicationId: string): Promise<SubmitResult> {
  const { data, error } = await client.rpc('submit_application', { p_application_id: applicationId });
  if (!error) return { ok: true, code: data };
  const msg = error.message ?? '';
  if (msg.startsWith('missing_answers:')) return { ok: false, kind: 'missing_answers', columns: msg.slice(16).split(',').map((c) => c.trim()) };
  if (msg.includes('terpmail_required')) return { ok: false, kind: 'terpmail_required' };
  for (const kind of ['cycle_closed', 'missing_files', 'not_agreed', 'not_found'] as const) {
    if (msg.includes(kind)) return { ok: false, kind };
  }
  // fetch-level failures have no Postgres error code
  return { ok: false, kind: error.code ? 'unknown' : 'network' };
}

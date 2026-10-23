// "Never twice" delivery for pushes, like the email log (packages/emails/src/deliver.ts). For each push it looks up the
// person's active phones, reserves a row in ops_push_log (the unique (user, key) index makes that atomic), sends, and gives
// the reservation back when every attempt fails, so a later run can try again. A person with no phone costs nothing and
// logs nothing. Never throws: a push must not break whatever called it.
import { isConfigured, sendToDevice, type Env, type SendOptions, type SendOutcome } from './apns';
import { twoRows } from './format';
import type { PushItem } from './plans';

/** Any Supabase client holding the service role, kept structural so this package needs no Supabase dependency. */
export type PushDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PushSummary = { configured: boolean; delivered: number; skipped: number; retry: number; noDevice: number; retired: number; failed: number };
export const emptySummary = (configured: boolean): PushSummary => ({ configured, delivered: 0, skipped: 0, retry: 0, noDevice: 0, retired: 0, failed: 0 });

export type DeliverOptions = { env?: Env; send?: (token: string, n: { title: string; body?: string; url?: string }) => Promise<SendOutcome>; sendOptions?: SendOptions };

type Device = { id: string; user_id: string; token: string };

export async function deliverPush(db: PushDb, items: PushItem[], options: DeliverOptions = {}): Promise<PushSummary> {
  const env = options.env ?? process.env;
  const send = options.send ?? ((token, n) => sendToDevice(token, n, { ...options.sendOptions, env }));
  const summary = emptySummary(options.send ? true : isConfigured(env));
  // Without the Apple key nothing is sent and nothing is reserved, so the same pushes go out once it is set.
  if (!summary.configured || items.length === 0) return summary;
  try {
    const userIds = [...new Set(items.map((i) => i.userId))];
    const found = await db.from('ops_push_devices').select('id, user_id, token').in('user_id', userIds).is('disabled_at', null);
    if (found.error) throw new Error(`devices: ${found.error.message}`);
    const byUser = new Map<string, Device[]>();
    for (const d of (found.data ?? []) as Device[]) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d]);

    for (const item of items) {
      const devices = byUser.get(item.userId) ?? [];
      if (devices.length === 0) {
        summary.noDevice += 1;
        continue;
      }
      const words = twoRows(item);
      let claim: string | number | null = null;
      try {
        const reserved = await db.from('ops_push_log').insert({ user_id: item.userId, key: item.key.slice(0, 200), title: words.title }).select('id').single();
        if (reserved.error) {
          if (reserved.error.code === '23505') {
            summary.skipped += 1;
            continue;
          }
          throw new Error(`log: ${reserved.error.message}`);
        }
        claim = (reserved.data as { id: number }).id;
        const outcomes = await Promise.all(devices.map((d) => send(d.token, { ...words, url: item.url }).then((o) => ({ d, o }))));
        const dead = outcomes.filter((x) => x.o.result === 'dead');
        if (dead.length > 0) {
          await db.from('ops_push_devices').update({ disabled_at: new Date().toISOString(), last_error: dead[0].o.detail.slice(0, 200) }).in('id', dead.map((x) => x.d.id));
          summary.retired += dead.length;
        }
        if (outcomes.some((x) => x.o.result === 'delivered')) {
          summary.delivered += 1;
          await db.from('ops_push_log').update({ result: 'delivered' }).eq('id', claim);
        } else if (dead.length === outcomes.length) {
          // Every phone was gone: nothing more to try, keep the reservation so we don't retry forever.
          await db.from('ops_push_log').update({ result: 'dead' }).eq('id', claim);
        } else {
          summary.retry += 1;
          await db.from('ops_push_log').delete().eq('id', claim);
        }
      } catch (err) {
        summary.failed += 1;
        if (claim !== null) await db.from('ops_push_log').delete().eq('id', claim);
        console.error('[push] a push failed to send', err instanceof Error ? err.message : 'unknown');
      }
    }
  } catch (err) {
    summary.failed += 1;
    console.error('[push] could not send pushes', err instanceof Error ? err.message : 'unknown');
  }
  return summary;
}

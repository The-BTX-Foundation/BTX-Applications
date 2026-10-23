// Push notifications for the Ops Hub, server side. SERVER ONLY. The Apple sender, the "never twice" log and the wording
// live in @btx/push; this file connects them to the Ops Hub's database access and its staff checks.
import { createServiceClient } from '@btx/data/server';
import { deliverPush, emptySummary, type PushItem, type PushSummary } from '@btx/push';
import { isStaffRole, type StaffRole } from '../role';
import { sessionClient } from '../supabase-server';

export type ServiceDb = NonNullable<ReturnType<typeof createServiceClient>>;

/** Sends the pushes with the service role. Never throws; with no service key or no Apple key it sends nothing. */
export async function sendPushes(items: PushItem[], db: ServiceDb | null = createServiceClient()): Promise<PushSummary> {
  if (!db || items.length === 0) return emptySummary(false);
  try {
    return await deliverPush(db, items);
  } catch (err) {
    console.error('[push] could not send pushes', err instanceof Error ? err.message : 'unknown');
    return { ...emptySummary(true), failed: items.length };
  }
}

/**
 * Every board member (staff role admin or board). The roles are read for the people in staff_profiles only, one by one:
 * the auth project also holds every student, so listing its users would stop seeing board members past the first page.
 */
export async function staffUserIds(db: ServiceDb): Promise<string[]> {
  const profiles = await db.from('staff_profiles').select('user_id');
  if (profiles.error) throw new Error('staff list');
  const ids = [...new Set((profiles.data ?? []).map((p: { user_id: string }) => p.user_id))];
  const roles = await Promise.all(ids.map(async (id) => ((await db.auth.admin.getUserById(id)).data.user?.app_metadata?.role)));
  return ids.filter((_, i) => isStaffRole(roles[i]));
}

export type StaffCaller = { id: string; role: StaffRole };

/** The signed-in board member making this request, from their session, or null. The user id is never taken from a request body. */
export async function staffCaller(): Promise<StaffCaller | null> {
  try {
    const { data } = await (await sessionClient()).auth.getUser();
    const user = data.user;
    const role = user?.app_metadata?.role;
    return user && isStaffRole(role) ? { id: user.id, role } : null;
  } catch {
    return null;
  }
}

/**
 * True for a same-site JSON POST. The content type must be exactly application/json (a form or a no-cors fetch from another
 * site can only send simple types, and a lookalike such as "text/plain; x=application/json" is still simple), and when the
 * browser says which site the request came from (Origin), that site must be this one.
 */
export function isJsonRequest(request: Request): boolean {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

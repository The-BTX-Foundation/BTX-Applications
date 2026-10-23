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

/** Every board member (staff role admin or board). */
export async function staffUserIds(db: ServiceDb): Promise<string[]> {
  const [profiles, users] = await Promise.all([db.from('staff_profiles').select('user_id'), db.auth.admin.listUsers({ page: 1, perPage: 1000 })]);
  if (profiles.error || users.error) throw new Error('staff list');
  const role = new Map(users.data.users.map((u) => [u.id, u.app_metadata?.role]));
  return (profiles.data ?? []).map((p: { user_id: string }) => p.user_id).filter((id: string) => isStaffRole(role.get(id)));
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

/** True for a JSON POST. Refusing other content types stops a form on another site from posting here with the visitor's cookies. */
export function isJsonRequest(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').toLowerCase().includes('application/json');
}

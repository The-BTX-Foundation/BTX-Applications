'use server';

// Changes a staff member's role. Roles live in auth.users.raw_app_meta_data (the field public.app_role() reads), which only
// the Auth admin API can write, so this runs on the server with the project's service key. NOT TESTED: needs the service key.
// SUPABASE_SERVICE_ROLE_KEY is read from the server's environment only (never NEXT_PUBLIC_, never committed); it is not set
// anywhere yet. The rules are checked again here, on top of the database's: only an admin changes roles, nobody changes
// their own, and only the three staff roles exist.
import { sessionClient } from './supabase-server';
import { isStaffRole, type StaffRole } from './role';

export type ChangeRoleResult = { ok: true } | { ok: false; reason: string };

export async function changeRoleAction(targetUserId: string, role: StaffRole): Promise<ChangeRoleResult> {
  if (!isStaffRole(role) || typeof targetUserId !== 'string' || !/^[0-9a-f-]{36}$/i.test(targetUserId)) return { ok: false, reason: 'That change is not allowed.' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, reason: "Changing roles isn't set up on this server yet." };

  // Who is asking: the session's own user, read from the auth server (not from anything the browser sent).
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  const caller = data.user;
  if (!caller || caller.app_metadata?.role !== 'admin') return { ok: false, reason: 'Only admins can change roles.' };
  if (caller.id === targetUserId) return { ok: false, reason: 'No one can change their own role.' };

  // Auth admin API: update the user's app_metadata (merged, so other fields stay).
  const res = await fetch(`${url}/auth/v1/admin/users/${targetUserId}`, {
    method: 'PUT',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_metadata: { role } }),
    cache: 'no-store',
  });
  return res.ok ? { ok: true } : { ok: false, reason: "The role didn't change. Try again." };
}

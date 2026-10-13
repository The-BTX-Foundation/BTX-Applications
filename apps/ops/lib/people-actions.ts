'use server';

// Staff administration for Board members. One staff role, board member; app_metadata.role 'admin' means a board member
// with admin rights. Roles live in auth.users.raw_app_meta_data (the field public.app_role()
// reads), which only the Auth admin API can write, so these run on the server with the project's service key
// (lib/staff-admin.ts). Tested locally as admin. SUPABASE_SERVICE_ROLE_KEY is read from the server's environment only
// (never NEXT_PUBLIC_, never committed). The rules are checked again here, on top of the database's: only an admin
// changes roles or invites people, nobody changes their own role, and only the three staff roles exist.
import { sessionClient } from './supabase-server';
import { isStaffRole, type StaffRole } from './role';
import { createStaffUser, setUserRole, type InviteResult } from './staff-admin';

export type ChangeRoleResult = { ok: true } | { ok: false; reason: string };

// The signed-in admin, or a plain reason why not. The role is read from the auth server, not from anything the browser sent.
async function adminCaller(): Promise<{ ok: true; id: string; url: string; key: string } | { ok: false; reason: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, reason: "Changing admin rights isn't set up on this server yet." };
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  const caller = data.user;
  if (!caller || caller.app_metadata?.role !== 'admin') return { ok: false, reason: "Only board members with admin rights can give or remove admin rights." };
  return { ok: true, id: caller.id, url, key };
}

export async function changeRoleAction(targetUserId: string, role: StaffRole): Promise<ChangeRoleResult> {
  if (!isStaffRole(role) || typeof targetUserId !== 'string' || !/^[0-9a-f-]{36}$/i.test(targetUserId)) return { ok: false, reason: 'That change is not allowed.' };
  const who = await adminCaller();
  if (!who.ok) return who;
  if (who.id === targetUserId) return { ok: false, reason: "You can't change your own admin rights." };
  const ok = await setUserRole({ url: who.url, key: who.key }, targetUserId, role);
  return ok ? { ok: true } : { ok: false, reason: "The admin rights didn't change. Try again." };
}

// Adds a staff member (admin only): creates the sign-in with the role set and the email confirmed, plus their staff_profiles
// row, and returns that row. It sends no email. (No screen calls it yet: the invite design is waiting for sign-off.)
export async function inviteStaff(input: { name: string; email: string; role: StaffRole }): Promise<InviteResult> {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isStaffRole(input.role)) return { ok: false, reason: 'That name, email or role is not valid.' };
  const who = await adminCaller();
  if (!who.ok) return who;
  return createStaffUser({ url: who.url, key: who.key }, { name, email, role: input.role });
}

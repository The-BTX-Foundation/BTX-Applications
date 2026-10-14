'use server';

// People and roles: the server actions (role changes and adding staff). The logic and its checks are in lib/staff-admin.ts
// (pure, unit-tested); this file supplies the real caller (the session's user, read from the auth server, never from
// anything the browser sent) and the service key. SUPABASE_SERVICE_ROLE_KEY is read from the server's environment only
// (never NEXT_PUBLIC_, never committed). Tested live against the local stack (2026-10-12).
import { sessionClient } from './supabase-server';
import { changeRole, inviteStaffWith, type AdminDeps, type ChangeRoleResult, type InviteInput, type InviteResult } from './staff-admin';
import type { StaffRole } from './role';

async function deps(): Promise<AdminDeps> {
  const client = await sessionClient();
  const { data } = await client.auth.getUser();
  const user = data.user;
  return {
    fetch,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    caller: user ? { id: user.id, role: user.app_metadata?.role } : null,
  };
}

// Changes a staff member's role: admins only, never your own.
export async function changeRoleAction(targetUserId: string, role: StaffRole): Promise<ChangeRoleResult> {
  return changeRole(await deps(), targetUserId, role);
}

// Adds a staff member (admins only): the account with its role, and the staff_profiles row. Sends no email.
export async function inviteStaff(input: InviteInput): Promise<InviteResult> {
  return inviteStaffWith(await deps(), input);
}

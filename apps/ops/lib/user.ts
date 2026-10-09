// The signed-in person as the shell shows them (name, initials, role). In mock mode (no Supabase env) it is the
// sample board member from the Figma frames. In live mode it comes from the session, and a visitor with no staff
// role is sent to /auth/denied, which signs them out (the proxy does the same check first; this is the second lock).
import { redirect } from 'next/navigation';
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { isStaffRole, roleLabel, type StaffRole } from './role';

export type OpsUser = { id: string; name: string; initials: string; role: StaffRole; roleText: string; email: string; mock: boolean };

// "dania.morris@x.org" -> "Dania Morris".
function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// Two-letter initials from a name.
export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Loads the signed-in staff member, or redirects.
export async function requireStaff(): Promise<OpsUser> {
  if (!hasSupabaseEnv()) {
    return { id: 'dm', name: 'Dania Morris', initials: 'DM', role: 'admin', roleText: 'Admin', email: 'dania@example.org', mock: true };
  }
  const client = await sessionClient();
  // getUser() asks the auth server, so a removed account or a changed role takes effect at once.
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) redirect('/sign-in');
  const role = user.app_metadata?.role;
  if (!isStaffRole(role)) redirect('/auth/denied');
  const email = user.email ?? '';
  const meta = user.user_metadata as { full_name?: string } | undefined;
  const name = meta?.full_name || nameFromEmail(email) || 'BTX staff';
  return { id: user.id, name, initials: initialsOf(name), role, roleText: roleLabel(role), email, mock: false };
}

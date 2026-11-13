// The signed-in person as the shell shows them (name, initials, role). In mock mode (no Supabase env) it is the
// sample board member from the Figma frames. In live mode it comes from the session, and a visitor with no staff
// role is sent to /auth/denied, which signs them out (the proxy does the same check first; this is the second lock).
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { readRows } from './daily-db';
import { isStaffRole, roleLabel, type StaffRole } from './role';

export type OpsUser = { id: string; name: string; initials: string; role: StaffRole; roleText: string; email: string; mock: boolean };

// "dana.mercer@x.org" -> "Dana Mercer".
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

// The name to show for a staff member: the board profile's display name (the same source the Interviews page uses), then
// the sign-up name, then the email's first part, then a plain default. Pure, so it is tested.
export function pickDisplayName(profileName: string | null | undefined, metaName: string | null | undefined, email: string): string {
  return profileName?.trim() || metaName?.trim() || nameFromEmail(email) || 'BTX staff';
}

// Loads the signed-in staff member, or redirects. Wrapped in React's per-request cache: the layout and the page both ask,
// and the second ask reuses the first answer instead of calling the auth server and the database again.
export const requireStaff = cache(async (): Promise<OpsUser> => {
  if (!hasSupabaseEnv()) {
    return { id: 'dm', name: 'Dana Mercer', initials: 'DM', role: 'admin', roleText: roleLabel('admin'), email: 'dana@example.org', mock: true };
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
  // The board member's own profile row (display name and initials). A failed or empty read falls back to the sign-up
  // name or the email, so the shell never breaks on it.
  let profile: { display_name?: unknown; initials?: unknown } | null = null;
  try {
    const rows = await readRows('staff_profiles', 'display_name, initials', { eq: { user_id: user.id }, limit: 1 });
    profile = rows[0] ?? null;
  } catch {
    profile = null;
  }
  const profileName = typeof profile?.display_name === 'string' ? profile.display_name : null;
  const profileInitials = typeof profile?.initials === 'string' ? profile.initials.trim() : '';
  const name = pickDisplayName(profileName, meta?.full_name, email);
  const initials = profileInitials || initialsOf(name);
  return { id: user.id, name, initials, role, roleText: roleLabel(role), email, mock: false };
});

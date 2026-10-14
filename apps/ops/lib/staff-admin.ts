// The People and roles admin writes, as pure functions that take their dependencies (fetch, the Supabase URL and service
// key, and the caller), so they can be tested without next/headers. lib/people-actions.ts ('use server') wraps them with
// the real session and environment. Roles live in auth.users.raw_app_meta_data (what public.app_role() reads), which only
// the Auth admin API can write, so both run on the server with the service key and check the caller themselves:
// only an admin changes roles or adds staff, and nobody changes their own role.
import { isStaffRole, type StaffRole } from './role';

export type Caller = { id: string; role: unknown } | null;
export type AdminDeps = { fetch: typeof fetch; url: string | undefined; key: string | undefined; caller: Caller };

export type ChangeRoleResult = { ok: true } | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

// Changes another staff member's role (admin only, never your own).
export async function changeRole(deps: AdminDeps, targetUserId: string, role: StaffRole): Promise<ChangeRoleResult> {
  if (!isStaffRole(role) || typeof targetUserId !== 'string' || !UUID.test(targetUserId)) return { ok: false, reason: 'That change is not allowed.' };
  if (!deps.url || !deps.key) return { ok: false, reason: "Changing roles isn't set up on this server yet." };
  if (!deps.caller || deps.caller.role !== 'admin') return { ok: false, reason: 'Only admins can change roles.' };
  if (deps.caller.id === targetUserId) return { ok: false, reason: 'No one can change their own role.' };
  // Auth admin API: app_metadata is merged, so other fields stay.
  const res = await deps.fetch(`${deps.url}/auth/v1/admin/users/${targetUserId}`, {
    method: 'PUT',
    headers: headers(deps.key),
    body: JSON.stringify({ app_metadata: { role } }),
    cache: 'no-store',
  });
  return res.ok ? { ok: true } : { ok: false, reason: "The role didn't change. Try again." };
}

/** What inviteStaff returns for the new person: their staff_profiles row plus role and email. */
export type InvitedStaff = { user_id: string; display_name: string; initials: string; title: string | null; role: StaffRole; email: string };
export type InviteInput = { name: string; email: string; role: StaffRole };
export type InviteResult = { ok: true; person: InvitedStaff } | { ok: false; reason: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Initials for staff_profiles.initials (^[A-Z]{1,3}$): first and last word's first letter, accents dropped, "X" if none. */
export function profileInitials(name: string, email = ''): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);
  const out = words.length === 0 ? '' : (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  if (out) return out;
  const e = email.replace(/[^A-Za-z]/g, '')[0];
  return e ? e.toUpperCase() : 'X';
}

// Creates a staff account (admin only): the Auth user with the role in app_metadata and the name in user_metadata,
// email already confirmed, then its staff_profiles row. No email is sent here. If the profile can't be saved, the new
// account is removed again so no half-made account is left; if even that fails, the reason says so.
export async function inviteStaffWith(deps: AdminDeps, input: InviteInput): Promise<InviteResult> {
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = input?.role;
  if (!name || name.length > 120) return { ok: false, reason: 'Add a name (up to 120 characters).' };
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, reason: 'That email address doesn’t look right.' };
  if (!isStaffRole(role)) return { ok: false, reason: 'Pick Admin, Board or Reviewer.' };
  if (!deps.url || !deps.key) return { ok: false, reason: "Adding people isn't set up on this server yet." };
  if (!deps.caller || deps.caller.role !== 'admin') return { ok: false, reason: 'Only admins can add people.' };

  const created = await deps.fetch(`${deps.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(deps.key),
    body: JSON.stringify({ email, email_confirm: true, app_metadata: { role }, user_metadata: { full_name: name } }),
    cache: 'no-store',
  });
  const body = (await created.json().catch(() => null)) as { id?: string; error_code?: string; code?: string | number; msg?: string; message?: string } | null;
  if (!created.ok) {
    const text = `${body?.error_code ?? ''} ${body?.code ?? ''} ${body?.msg ?? ''} ${body?.message ?? ''}`.toLowerCase();
    if (created.status === 422 && (text.includes('email_exists') || text.includes('already'))) return { ok: false, reason: 'That email already has an account.' };
    return { ok: false, reason: "The account wasn't created. Try again." };
  }
  const id = body?.id;
  if (!id) return { ok: false, reason: "The account wasn't created. Try again." };

  const row = { user_id: id, display_name: name, initials: profileInitials(name, email), title: null };
  const saved = await deps.fetch(`${deps.url}/rest/v1/staff_profiles`, {
    method: 'POST',
    headers: { ...headers(deps.key), Prefer: 'return=representation' },
    body: JSON.stringify(row),
    cache: 'no-store',
  });
  if (!saved.ok) {
    const undo = await deps.fetch(`${deps.url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: headers(deps.key), cache: 'no-store' }).catch(() => null);
    return undo?.ok
      ? { ok: false, reason: "The profile wasn't saved, so the account was not created. Try again." }
      : { ok: false, reason: `The profile wasn't saved and the account for ${email} could not be removed. Ask a BTX admin to remove it.` };
  }
  return { ok: true, person: { ...row, role, email } };
}

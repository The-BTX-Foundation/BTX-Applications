// Server-side staff administration through the Auth admin API and the project's service key. No Next.js imports, so the
// functions can be unit tested with a mocked fetch. Callers (lib/people-actions.ts) check who is asking first.
import { initialsOf } from './money-logic';
import { isStaffRole, type StaffRole } from './role';

export type AdminEnv = { url: string; key: string; fetchImpl?: typeof fetch };
export type InviteInput = { name: string; email: string; role: StaffRole };
export type StaffRow = { user_id: string; display_name: string; initials: string; title: string | null };
export type InviteResult = { ok: true; row: StaffRow } | { ok: false; reason: string };

const headers = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

// Sets a user's role (auth app_metadata, merged so other fields stay). Only admin or board: there are no other staff
// roles (owner, 2026-10-12), so anything else is refused without calling the API.
export async function setUserRole(env: AdminEnv, userId: string, role: StaffRole): Promise<boolean> {
  if (!isStaffRole(role)) return false;
  const f = env.fetchImpl ?? fetch;
  const res = await f(`${env.url}/auth/v1/admin/users/${userId}`, { method: 'PUT', headers: headers(env.key), body: JSON.stringify({ app_metadata: { role } }), cache: 'no-store' });
  return res.ok;
}

// Creates a staff member: the auth user (email confirmed, role in app_metadata) and their staff_profiles row. When the
// profile row fails the new auth user is removed again, so a retry starts clean. Returns the new profile row.
export async function createStaffUser(env: AdminEnv, input: InviteInput): Promise<InviteResult> {
  if (!isStaffRole(input.role)) return { ok: false, reason: 'A person can be an Admin or a Board member.' };
  const f = env.fetchImpl ?? fetch;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const created = await f(`${env.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(env.key),
    body: JSON.stringify({ email, email_confirm: true, app_metadata: { role: input.role }, user_metadata: { full_name: name } }),
    cache: 'no-store',
  });
  if (!created.ok) {
    const body = (await created.json().catch(() => ({}))) as { msg?: string; error_code?: string; code?: string };
    const taken = created.status === 422 || body.error_code === 'email_exists' || /already/i.test(body.msg ?? '');
    return { ok: false, reason: taken ? 'Someone with that email already has an account.' : "The account wasn't created. Try again." };
  }
  const user = (await created.json()) as { id?: string };
  if (!user.id) return { ok: false, reason: "The account wasn't created. Try again." };

  const profile = await f(`${env.url}/rest/v1/staff_profiles`, {
    method: 'POST',
    headers: { ...headers(env.key), Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: user.id, display_name: name, initials: initialsOf(name) }),
    cache: 'no-store',
  });
  const rows = profile.ok ? ((await profile.json().catch(() => null)) as StaffRow[] | null) : null;
  if (!rows?.[0]) {
    await f(`${env.url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: headers(env.key), cache: 'no-store' });
    return { ok: false, reason: "The profile wasn't created. Try again." };
  }
  return { ok: true, row: rows[0] };
}

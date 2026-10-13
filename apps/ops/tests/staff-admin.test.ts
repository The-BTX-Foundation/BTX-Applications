import { describe, expect, it } from 'vitest';
import { createStaffUser, setUserRole } from '@/lib/staff-admin';

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
function mockFetch(responses: { ok: boolean; status?: number; json?: unknown }[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers as Record<string, string> });
    const r = responses.shift() ?? { ok: false, status: 500 };
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.json ?? {} } as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const env = (fetchImpl: typeof fetch) => ({ url: 'http://x', key: 'k', fetchImpl });

describe('createStaffUser', () => {
  it('creates the auth user with the role and a confirmed email, then the profile, and returns the row', async () => {
    const row = { user_id: 'u1', display_name: 'Ada Lovelace', initials: 'AL', title: null };
    const m = mockFetch([{ ok: true, json: { id: 'u1' } }, { ok: true, json: [row] }]);
    const r = await createStaffUser(env(m.fetchImpl), { name: ' Ada Lovelace ', email: 'Ada@Example.com', role: 'board' });
    expect(r).toEqual({ ok: true, row });
    expect(m.calls[0]).toMatchObject({ url: 'http://x/auth/v1/admin/users', method: 'POST', body: { email: 'ada@example.com', email_confirm: true, app_metadata: { role: 'board' } } });
    expect(m.calls[0].headers.Authorization).toBe('Bearer k');
    expect(m.calls[1]).toMatchObject({ url: 'http://x/rest/v1/staff_profiles', method: 'POST', body: { user_id: 'u1', display_name: 'Ada Lovelace', initials: 'AL' } });
  });
  it('says so when the email already has an account, and writes no profile', async () => {
    const m = mockFetch([{ ok: false, status: 422, json: { error_code: 'email_exists' } }]);
    const r = await createStaffUser(env(m.fetchImpl), { name: 'A B', email: 'a@b.co', role: 'board' });
    expect(r).toEqual({ ok: false, reason: 'Someone with that email already has an account.' });
    expect(m.calls).toHaveLength(1);
  });
  it('refuses any role but admin or board, without calling the API (no reviewer role)', async () => {
    const m = mockFetch([]);
    const r = await createStaffUser(env(m.fetchImpl), { name: 'A B', email: 'a@b.co', role: 'reviewer' as never });
    expect(r).toEqual({ ok: false, reason: 'A person can be an Admin or a Board member.' });
    expect(m.calls).toHaveLength(0);
  });
  it('removes the new auth user when the profile row fails', async () => {
    const m = mockFetch([{ ok: true, json: { id: 'u2' } }, { ok: false, status: 400 }, { ok: true }]);
    const r = await createStaffUser(env(m.fetchImpl), { name: 'A B', email: 'a@b.co', role: 'admin' });
    expect(r.ok).toBe(false);
    expect(m.calls[2]).toMatchObject({ url: 'http://x/auth/v1/admin/users/u2', method: 'DELETE' });
  });
});

describe('setUserRole', () => {
  it('puts the role into app_metadata', async () => {
    const m = mockFetch([{ ok: true }]);
    expect(await setUserRole(env(m.fetchImpl), 'u9', 'admin')).toBe(true);
    expect(m.calls[0]).toMatchObject({ url: 'http://x/auth/v1/admin/users/u9', method: 'PUT', body: { app_metadata: { role: 'admin' } } });
  });
  it('refuses any role but admin or board (no reviewer role)', async () => {
    const m = mockFetch([{ ok: true }]);
    expect(await setUserRole(env(m.fetchImpl), 'u9', 'reviewer' as never)).toBe(false);
    expect(m.calls).toHaveLength(0);
  });
  it('reports failure', async () => {
    expect(await setUserRole(env(mockFetch([{ ok: false }]).fetchImpl), 'u9', 'board')).toBe(false);
  });
});

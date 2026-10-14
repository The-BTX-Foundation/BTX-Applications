import { describe, expect, it, vi } from 'vitest';
import { changeRole, inviteStaffWith, profileInitials, type AdminDeps } from '@/lib/staff-admin';

const URL_ = 'http://db.test';
const ADMIN = { id: 'a0000000-0000-4000-8000-000000000001', role: 'admin' };
const TARGET = 'b0000000-0000-4000-8000-000000000009';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// A fetch that answers by method + path; records every call.
function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${u.pathname}`;
    const hit = Object.entries(routes).find(([k]) => key.startsWith(k));
    if (!hit) throw new Error(`unexpected ${key}`);
    return hit[1]();
  });
}
const deps = (f: ReturnType<typeof fakeFetch>, caller: AdminDeps['caller'] = ADMIN): AdminDeps => ({ fetch: f as unknown as typeof fetch, url: URL_, key: 'service', caller });

describe('inviteStaffWith', () => {
  const input = { name: '[B] Ivy Invite', email: ' B-Staff-Invite-1@BTX.test ', role: 'board' as const };

  it('creates the account with the role and name, then the profile, and returns the row', async () => {
    const f = fakeFetch({ 'POST /auth/v1/admin/users': () => json(200, { id: TARGET }), 'POST /rest/v1/staff_profiles': () => json(201, [{}]) });
    const r = await inviteStaffWith(deps(f), input);
    expect(r).toEqual({ ok: true, person: { user_id: TARGET, display_name: '[B] Ivy Invite', initials: 'II', title: null, role: 'board', email: 'b-staff-invite-1@btx.test' } });
    const auth = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(auth).toEqual({ email: 'b-staff-invite-1@btx.test', email_confirm: true, app_metadata: { role: 'board' }, user_metadata: { full_name: '[B] Ivy Invite' } });
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer service');
    expect(JSON.parse(String(f.mock.calls[1][1]?.body))).toEqual({ user_id: TARGET, display_name: '[B] Ivy Invite', initials: 'II', title: null });
  });

  it('refuses a caller who is not an admin, without calling anything', async () => {
    const f = fakeFetch({});
    expect(await inviteStaffWith(deps(f, { id: 'x', role: 'board' }), input)).toEqual({ ok: false, reason: 'Only admins can add people.' });
    expect(await inviteStaffWith(deps(f, null), input)).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses bad input', async () => {
    const f = fakeFetch({});
    expect(await inviteStaffWith(deps(f), { ...input, name: '   ' })).toMatchObject({ ok: false, reason: expect.stringContaining('name') });
    expect(await inviteStaffWith(deps(f), { ...input, email: 'not-an-email' })).toMatchObject({ ok: false, reason: expect.stringContaining('email') });
    expect(await inviteStaffWith(deps(f), { ...input, role: 'applicant' as never })).toMatchObject({ ok: false, reason: 'Pick Admin, Board or Reviewer.' });
    expect(f).not.toHaveBeenCalled();
  });

  it('says so when the email already has an account', async () => {
    const f = fakeFetch({ 'POST /auth/v1/admin/users': () => json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }) });
    expect(await inviteStaffWith(deps(f), input)).toEqual({ ok: false, reason: 'That email already has an account.' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('removes the new account when the profile is not saved', async () => {
    const f = fakeFetch({ 'POST /auth/v1/admin/users': () => json(200, { id: TARGET }), 'POST /rest/v1/staff_profiles': () => json(400, { message: 'bad' }), 'DELETE /auth/v1/admin/users/': () => json(200, {}) });
    const r = await inviteStaffWith(deps(f), input);
    expect(r).toEqual({ ok: false, reason: "The profile wasn't saved, so the account was not created. Try again." });
    expect(f.mock.calls[2][0]).toBe(`${URL_}/auth/v1/admin/users/${TARGET}`);
  });

  it('names the leftover account when it cannot be removed either', async () => {
    const f = fakeFetch({ 'POST /auth/v1/admin/users': () => json(200, { id: TARGET }), 'POST /rest/v1/staff_profiles': () => json(500, {}), 'DELETE /auth/v1/admin/users/': () => json(500, {}) });
    expect(await inviteStaffWith(deps(f), input)).toMatchObject({ ok: false, reason: expect.stringContaining('b-staff-invite-1@btx.test') });
  });

  it('needs the server to be set up', async () => {
    const f = fakeFetch({});
    expect(await inviteStaffWith({ ...deps(f), key: undefined }, input)).toMatchObject({ ok: false });
  });
});

describe('changeRole', () => {
  it('lets an admin change someone else', async () => {
    const f = fakeFetch({ 'PUT /auth/v1/admin/users/': () => json(200, {}) });
    expect(await changeRole(deps(f), TARGET, 'admin')).toEqual({ ok: true });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ app_metadata: { role: 'admin' } });
  });
  it('refuses board members, your own role, and bad values', async () => {
    const f = fakeFetch({});
    expect(await changeRole(deps(f, { id: 'x', role: 'board' }), TARGET, 'admin')).toEqual({ ok: false, reason: 'Only admins can change roles.' });
    expect(await changeRole(deps(f), ADMIN.id, 'board')).toEqual({ ok: false, reason: 'No one can change their own role.' });
    expect(await changeRole(deps(f), 'nope', 'board')).toMatchObject({ ok: false });
    expect(await changeRole(deps(f), TARGET, 'applicant' as never)).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });
  it('reports a failed update', async () => {
    const f = fakeFetch({ 'PUT /auth/v1/admin/users/': () => json(500, {}) });
    expect(await changeRole(deps(f), TARGET, 'board')).toMatchObject({ ok: false });
  });
});

describe('profileInitials', () => {
  it('fits the staff_profiles rule', () => {
    expect(profileInitials('Dania Morris')).toBe('DM');
    expect(profileInitials('[B] Ivy Invite')).toBe('II');
    expect(profileInitials('Zoë Ångström-Lee')).toBe('ZA');
    expect(profileInitials('Cher')).toBe('C');
    expect(profileInitials('李雷', 'li@x.org')).toBe('L');
    expect(profileInitials('123', '')).toBe('X');
  });
});

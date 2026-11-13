// changeRoleAction (lib/people-actions.ts): the server half of the double guard on admin rights. The caller's role comes
// from the auth server (sessionClient().auth.getUser()), only an admin may change roles, nobody changes their own, and only
// 'admin' / 'board' on a uuid-shaped id are accepted. The service-key write (setUserRole) is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: null as null | { id: string; app_metadata?: { role?: string } }, setUserRole: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ sessionClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/lib/staff-admin', () => ({ setUserRole: h.setUserRole, createStaffUser: vi.fn() }));

import { changeRoleAction } from '@/lib/people-actions';

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  h.user = { id: ME, app_metadata: { role: 'admin' } };
  h.setUserRole.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('changeRoleAction', () => {
  it('gives admin rights when an admin changes someone else', async () => {
    expect(await changeRoleAction(THEM, 'admin')).toEqual({ ok: true });
    expect(h.setUserRole).toHaveBeenCalledWith({ url: 'http://x', key: 'k' }, THEM, 'admin');
  });
  it('refuses a caller without admin rights (role read from the auth server)', async () => {
    h.user = { id: ME, app_metadata: { role: 'board' } };
    const r = await changeRoleAction(THEM, 'admin');
    expect(r).toEqual({ ok: false, reason: 'Only board members with admin rights can give or remove admin rights.' });
    expect(h.setUserRole).not.toHaveBeenCalled();
  });
  it('refuses a signed-out caller', async () => {
    h.user = null;
    expect((await changeRoleAction(THEM, 'board')).ok).toBe(false);
    expect(h.setUserRole).not.toHaveBeenCalled();
  });
  it("refuses a change to the caller's own role", async () => {
    expect(await changeRoleAction(ME, 'board')).toEqual({ ok: false, reason: "You can't change your own admin rights." });
    expect(h.setUserRole).not.toHaveBeenCalled();
  });
  it('refuses a role that is not admin or board', async () => {
    expect(await changeRoleAction(THEM, 'owner' as never)).toEqual({ ok: false, reason: 'That change is not allowed.' });
    expect(h.setUserRole).not.toHaveBeenCalled();
  });
  it('refuses an id that is not a uuid', async () => {
    for (const id of ['kd', '', `${THEM}x`, 42 as never]) expect((await changeRoleAction(id, 'admin')).ok).toBe(false);
    expect(h.setUserRole).not.toHaveBeenCalled();
  });
  it('refuses when the server has no service key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await changeRoleAction(THEM, 'admin')).toEqual({ ok: false, reason: "Changing admin rights isn't set up on this server yet." });
  });
  it('reports a failed write', async () => {
    h.setUserRole.mockResolvedValue(false);
    expect(await changeRoleAction(THEM, 'board')).toEqual({ ok: false, reason: "The admin rights didn't change. Try again." });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A query builder that records every call and resolves to a canned result when awaited (or when maybeSingle() ends it).
type Call = [string, ...unknown[]];
function chain(result: unknown | ((calls: Call[]) => unknown)) {
  const calls: Call[] = [];
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: unknown) => unknown) => ok(typeof result === 'function' ? (result as (c: Call[]) => unknown)(calls) : result);
      return (...args: unknown[]) => (calls.push([String(prop), ...args]), p);
    },
  });
  return { p, calls };
}

const { createServiceClient, sessionClient, deliverPush } = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  sessionClient: vi.fn(),
  deliverPush: vi.fn(async (_db: unknown, items: unknown[]) => ({ configured: true, delivered: items.length, skipped: 0, retry: 0, noDevice: 0, retired: 0, failed: 0 })),
}));
vi.mock('@btx/data/server', () => ({ createServiceClient }));
vi.mock('@/lib/supabase-server', () => ({ sessionClient }));
vi.mock('@btx/push', async (orig) => ({ ...(await orig<typeof import('@btx/push')>()), deliverPush }));

import { POST as register } from '@/app/api/push/register/route';
import { POST as unregister } from '@/app/api/push/unregister/route';
import { POST as chatPush } from '@/app/api/push/chat/route';
import { POST as testPush } from '@/app/api/push/test/route';

const TOKEN = 'ab'.repeat(32);
const post = (url: string, body: unknown, type: string | null = 'application/json') =>
  new Request(`https://ops.example.org${url}`, { method: 'POST', headers: type ? { 'content-type': type } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** Signs the caller in (or out) and gives back the service-role tables by name. */
function world(opts: { user?: { id: string; role?: string } | null; tables?: Record<string, unknown | ((c: Call[]) => unknown)>; session?: Record<string, unknown> } = {}) {
  const { user = { id: 'u1', role: 'board' } } = opts;
  const made: Record<string, ReturnType<typeof chain>[]> = {};
  const db = {
    from: (table: string) => {
      const c = chain(opts.tables?.[table] ?? { data: null, error: null });
      (made[table] ??= []).push(c);
      return c.p;
    },
    auth: { admin: { listUsers: async () => ({ data: { users: [{ id: 'u1', app_metadata: { role: 'board' } }, { id: 'u2', app_metadata: { role: 'admin' } }, { id: 'u3', app_metadata: { role: 'board' } }, { id: 'ux', app_metadata: {} }] }, error: null }) } },
  };
  createServiceClient.mockReturnValue(db);
  const msg = chain({ data: opts.session ?? null, error: null });
  sessionClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: user ? { id: user.id, app_metadata: { role: user.role } } : null } }) }, from: () => msg.p });
  return { made, calls: (table: string, i = 0) => made[table]?.[i]?.calls ?? [] };
}

beforeEach(() => {
  createServiceClient.mockReset();
  sessionClient.mockReset();
  deliverPush.mockClear();
});

describe('POST /api/push/register', () => {
  it('saves the phone for the signed-in person, never for a user id in the body', async () => {
    const w = world();
    const res = await register(post('/api/push/register', { token: TOKEN, label: '  Dominick   iPhone ', user_id: 'someone-else' }));
    expect(await res.json()).toEqual({ ok: true });
    const upsert = w.calls('ops_push_devices').find((c) => c[0] === 'upsert')!;
    expect(upsert[1]).toMatchObject({ user_id: 'u1', kind: 'apns', token: TOKEN, label: 'Dominick iPhone', disabled_at: null });
    expect(JSON.stringify(upsert)).not.toContain('someone-else');
    // the same phone registered to someone else is switched off
    const off = w.calls('ops_push_devices', 1);
    expect(off.map((c) => c[0])).toEqual(['update', 'eq', 'neq', 'is']);
    expect(off[2]).toEqual(['neq', 'user_id', 'u1']);
  });

  it('is refused without a session, for a non-staff role, for a form post, and for a bad token', async () => {
    world({ user: null });
    expect((await register(post('/api/push/register', { token: TOKEN }))).status).toBe(401);
    world({ user: { id: 'u9', role: 'student' } });
    expect((await register(post('/api/push/register', { token: TOKEN }))).status).toBe(401);
    world();
    expect((await register(post('/api/push/register', 'token=abc', 'application/x-www-form-urlencoded'))).status).toBe(415);
    expect((await register(post('/api/push/register', 'x', null))).status).toBe(415);
    for (const token of ['', 'short', 'zz'.repeat(32), 123, `${TOKEN}'; drop table x;--`]) expect((await register(post('/api/push/register', { token }))).status).toBe(400);
    expect((await register(post('/api/push/register', 'not json'))).status).toBe(400);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('says so when the database is unavailable or the save fails', async () => {
    world();
    createServiceClient.mockReturnValue(null);
    expect((await register(post('/api/push/register', { token: TOKEN }))).status).toBe(503);
    world({ tables: { ops_push_devices: { error: { message: 'no' } } } });
    expect((await register(post('/api/push/register', { token: TOKEN }))).status).toBe(500);
  });
});

describe('POST /api/push/unregister', () => {
  it('switches off only the signed-in person\'s row for that phone', async () => {
    const w = world();
    expect((await (await unregister(post('/api/push/unregister', { token: TOKEN }))).json())).toEqual({ ok: true });
    const c = w.calls('ops_push_devices');
    expect(c.map((x) => x[0])).toEqual(['update', 'eq', 'eq', 'is']);
    expect(c[1]).toEqual(['eq', 'user_id', 'u1']);
    expect(c[2]).toEqual(['eq', 'token', TOKEN]);
  });

  it('is refused without a session, for a form post and for a bad token', async () => {
    world({ user: null });
    expect((await unregister(post('/api/push/unregister', { token: TOKEN }))).status).toBe(401);
    world();
    expect((await unregister(post('/api/push/unregister', 'token=1', 'text/plain'))).status).toBe(415);
    expect((await unregister(post('/api/push/unregister', { token: 'nope' }))).status).toBe(400);
  });
});

describe('POST /api/push/chat', () => {
  const MSG = '6f1c0d2e-8a4b-4c3d-9e5f-0a1b2c3d4e5f';
  const fresh = () => new Date(Date.now() - 20_000).toISOString();
  const message = (over: Record<string, unknown> = {}) => ({ id: MSG, channel_id: 'ch1', author_id: 'u1', is_bot: false, created_at: fresh(), ...over });
  const staffTable = (c: Call[]) => (c.some((x) => x[0] === 'maybeSingle') ? { data: { display_name: 'Kelsey Davis' }, error: null } : { data: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }, { user_id: 'ux' }], error: null });

  it('a channel message pushes "Board chat" to every other board member, with the name and never the message', async () => {
    world({ session: message(), tables: { chat_channels: { data: { kind: 'channel' } }, staff_profiles: staffTable } });
    const res = await chatPush(post('/api/push/chat', { messageId: MSG }));
    expect(await res.json()).toEqual({ ok: true, sent: 2 });
    const items = deliverPush.mock.calls[0][1] as { userId: string; title: string; body: string; key: string }[];
    expect(items.map((i) => i.userId)).toEqual(['u2', 'u3']); // not the author, not someone with no staff role
    expect(items[0]).toMatchObject({ title: 'Board chat', body: 'Kelsey Davis sent a message.', key: `chat:${MSG}:u2` });
  });

  it('a direct message pushes only to the channel\'s other members', async () => {
    world({ session: message(), tables: { chat_channels: { data: { kind: 'direct' } }, chat_channel_members: { data: [{ user_id: 'u1' }, { user_id: 'u3' }] }, staff_profiles: staffTable } });
    await chatPush(post('/api/push/chat', { messageId: MSG }));
    expect((deliverPush.mock.calls[0][1] as { userId: string }[]).map((i) => i.userId)).toEqual(['u3']);
  });

  it('sends nothing for a message that is not the caller\'s, a bot\'s, too old, or not visible to them', async () => {
    for (const session of [message({ author_id: 'u2' }), message({ is_bot: true }), message({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() }), null]) {
      world({ session: session as Record<string, unknown> | undefined });
      expect(await (await chatPush(post('/api/push/chat', { messageId: MSG }))).json()).toEqual({ ok: true, sent: 0 });
    }
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it('is refused without a session, for a form post and for a bad message id', async () => {
    world({ user: null });
    expect((await chatPush(post('/api/push/chat', { messageId: MSG }))).status).toBe(401);
    world();
    expect((await chatPush(post('/api/push/chat', 'x=1', 'text/plain'))).status).toBe(415);
    expect((await chatPush(post('/api/push/chat', { messageId: 'abc' }))).status).toBe(400);
    expect((await chatPush(post('/api/push/chat', { messageId: ["' or 1=1"] }))).status).toBe(400);
  });

  it('a failure while sending still answers ok, with nothing sent', async () => {
    world({ session: message(), tables: { chat_channels: { data: { kind: 'channel' } }, staff_profiles: staffTable } });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    deliverPush.mockRejectedValueOnce(new Error('apns'));
    expect(await (await chatPush(post('/api/push/chat', { messageId: MSG }))).json()).toEqual({ ok: true, sent: 0 });
    quiet.mockRestore();
  });
});

describe('POST /api/push/test', () => {
  it('lets an admin send a test push to their own phones', async () => {
    world({ user: { id: 'u2', role: 'admin' } });
    const res = await testPush(post('/api/push/test', {}));
    expect(await res.json()).toMatchObject({ ok: true, configured: true, delivered: 1 });
    const items = deliverPush.mock.calls[0][1] as { userId: string; title: string }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ userId: 'u2', title: 'Test from the Ops Hub' });
  });

  it('is for admins only, and needs a session and a JSON post', async () => {
    world({ user: { id: 'u1', role: 'board' } });
    expect((await testPush(post('/api/push/test', {}))).status).toBe(403);
    world({ user: null });
    expect((await testPush(post('/api/push/test', {}))).status).toBe(401);
    world({ user: { id: 'u2', role: 'admin' } });
    expect((await testPush(post('/api/push/test', 'x', 'text/plain'))).status).toBe(415);
    expect(deliverPush).not.toHaveBeenCalled();
  });
});

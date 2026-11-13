// Board chat live mode with the database faked: the live capabilities, one capped read per channel, which failures send
// the page to its load-error states (lib/chat-live.ts), and an idempotent retry of a send (lib/chat-actions.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  who: { id: 'u1', role: 'admin' } as { id: string; role: string } | null,
  directoryFails: false,
  failChannel: '' as string,
  messages: {} as Record<string, Row[]>,
  calls: [] as { channel: string; orders: string[]; limit: number }[],
}));

vi.mock('@/lib/daily-db', () => ({
  whoAmI: async () => db.who,
  callRpc: async () => {
    if (db.directoryFails) throw new Error('not staff');
    return [
      { user_id: 'u1', role: 'admin' },
      { user_id: 'u2', role: 'board' },
    ];
  },
  readRows: async (table: string) => {
    if (table === 'staff_profiles')
      return [
        { user_id: 'u1', display_name: 'Ann', initials: 'A' },
        { user_id: 'u2', display_name: 'Bo', initials: 'B' },
      ];
    if (table === 'chat_channels')
      return [
        { id: 'c-sch', kind: 'area', area: 'scholarships', direct_key: null },
        { id: 'c-dm', kind: 'direct', area: null, direct_key: 'u1:u2' },
      ];
    if (table === 'areas') return [{ slug: 'scholarships', name: 'Scholarships', position: 1 }];
    return [];
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  sessionClient: async () => ({
    from: () => ({
      select: () => {
        const q = { channel: '', orders: [] as string[], n: 0 };
        const chain = {
          eq: (_c: string, v: string) => ((q.channel = v), chain),
          order: (c: string, o: { ascending: boolean }) => (q.orders.push(`${c}:${o.ascending ? 'asc' : 'desc'}`), chain),
          limit: (n: number) => ((q.n = n), chain),
          then: (ok: (r: { data: Row[] | null; error: unknown }) => unknown) => {
            db.calls.push({ channel: q.channel, orders: q.orders, limit: q.n });
            const res = q.channel === db.failChannel ? { data: null, error: { message: 'no' } } : { data: (db.messages[q.channel] ?? []).slice(0, q.n), error: null };
            return Promise.resolve(res).then(ok);
          },
        };
        return chain;
      },
    }),
  }),
}));

const msg = (id: string, ch: string, at: string): Row => ({ id, channel_id: ch, author_id: 'u2', is_bot: false, body: id, created_at: at });

beforeEach(() => {
  db.who = { id: 'u1', role: 'admin' };
  db.directoryFails = false;
  db.failChannel = '';
  db.calls = [];
  db.messages = {};
});

describe('live chat view', () => {
  it('keeps Undo and pin changes off in live mode', async () => {
    const { LIVE_CAPS } = await import('@/lib/chat-live');
    expect(LIVE_CAPS).toEqual({ send: true, openDirect: true, markRead: true, unsend: false, pinToggle: false });
  });

  it('reads each channel on its own (newest 51, created_at then id), draws 50, and marks only a fuller one capped', async () => {
    const { loadLiveChatView, PER_CHANNEL_LIMIT } = await import('@/lib/chat-live');
    db.messages['c-sch'] = Array.from({ length: 60 }, (_, i) => msg(`s${String(99 - i).padStart(2, '0')}`, 'c-sch', new Date(Date.UTC(2026, 10, 10, 12, 59 - i)).toISOString()));
    db.messages['c-dm'] = [msg('d1', 'c-dm', '2026-11-01T10:00:00Z')];
    const view = await loadLiveChatView();
    if (view.failed) throw new Error('failed');
    expect(view.threadFailed).toBe(false);
    expect(db.calls.map((c) => c.channel).sort()).toEqual(['c-dm', 'c-sch']);
    expect(db.calls.every((c) => c.limit === PER_CHANNEL_LIMIT + 1 && c.orders.join() === 'created_at:desc,id:desc')).toBe(true);
    // The old direct message is still loaded beside the busy area's newest 50.
    expect(view.messages.length).toBe(51);
    expect(view.messages[0].id).toBe('d1');
    expect(view.capped).toEqual(['c-sch']);
    // Exactly 50 is everything: not capped.
    db.messages['c-sch'] = db.messages['c-sch'].slice(0, 50);
    const exact = await loadLiveChatView();
    expect(!exact.failed && exact.capped).toEqual([]);
  });

  it('sends one failed channel read to the load-error window, never an empty thread', async () => {
    const { loadLiveChatView } = await import('@/lib/chat-live');
    db.messages['c-sch'] = [msg('s1', 'c-sch', '2026-11-10T12:00:00Z')];
    db.failChannel = 'c-dm';
    const view = await loadLiveChatView();
    expect(!view.failed && view.threadFailed).toBe(true);
    expect(!view.failed && view.messages).toEqual([]);
  });

  it('refuses the page when the staff directory cannot be read, or the person is not signed in', async () => {
    const { loadLiveChatView } = await import('@/lib/chat-live');
    db.directoryFails = true;
    expect(await loadLiveChatView()).toEqual({ failed: true });
    db.directoryFails = false;
    db.who = null;
    expect(await loadLiveChatView()).toEqual({ failed: true });
  });
});

/* ---------- sending: a retry with the same id counts a unique-id refusal as saved, and pushes once ---------- */

const store = vi.hoisted(() => ({ rows: new Map<string, Row>(), inserts: [] as Row[], upserts: [] as { rows: Row[]; opts: unknown }[], failNextAfterSave: false, signals: [] as AbortSignal[] }));
vi.mock('@btx/data', () => ({
  hasSupabaseEnv: () => true,
  getBrowserClient: () => ({
    rpc: () => ({ abortSignal: async (sig: AbortSignal) => (store.signals.push(sig), { data: 'c-new', error: null }) }),
    from: () => ({
      insert: (row: Row) => ({
        select: () => ({
          single: () => ({
            abortSignal: async (sig: AbortSignal) => {
              store.signals.push(sig);
              store.inserts.push(row);
              const id = String(row.id ?? `db-${store.inserts.length}`);
              if (store.rows.has(id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
              store.rows.set(id, { id, created_at: '2026-11-10T14:20:00.000Z' });
              // The first try saves but its answer is lost (a timeout): the caller sees a failure.
              if (store.failNextAfterSave) {
                store.failNextAfterSave = false;
                throw new Error('timed out');
              }
              return { data: store.rows.get(id), error: null };
            },
          }),
        }),
      }),
      select: () => ({
        eq: (_c: string, id: string) => ({
          single: () => ({
            abortSignal: async (sig: AbortSignal) => (store.signals.push(sig), { data: store.rows.get(id) ?? null, error: null }),
          }),
        }),
      }),
      upsert: (rows: Row[], opts: unknown) => ({
        select: () => ({
          abortSignal: async () => {
            store.upserts.push({ rows, opts });
            return { data: rows, error: null };
          },
        }),
      }),
    }),
  }),
}));

describe('idempotent send', () => {
  it('a retry of the same message saves it once and pushes once', async () => {
    const fetchSpy = vi.fn(async () => new Response(null));
    vi.stubGlobal('fetch', fetchSpy);
    const { postMessage } = await import('@/lib/chat-actions');
    store.failNextAfterSave = true;
    await expect(postMessage('c-sch', 'Hello', { id: 'm-1' })).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    // The retry reuses the id: the database refuses the duplicate, and the saved row comes back as the result.
    expect(await postMessage('c-sch', 'Hello', { id: 'm-1' })).toEqual({ id: 'm-1', createdAt: '2026-11-10T14:20:00.000Z' });
    expect(store.rows.size).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The two-argument form (Today's chat card, the area pages) still works and lets the database make the id.
    expect((await postMessage('c-sch', 'Hi')).id).toMatch(/^db-/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('writes read markers with the person named and the table key for conflicts', async () => {
    const { markRead } = await import('@/lib/chat-actions');
    expect(await markRead({ 'c-sch': '2026-11-10T14:20:00.000Z' }, 'u1')).toBe(true);
    expect(store.upserts.at(-1)).toEqual({ rows: [{ channel_id: 'c-sch', user_id: 'u1', last_read_at: '2026-11-10T14:20:00.000Z' }], opts: { onConflict: 'channel_id,user_id' } });
  });

  it('spends one 15-second budget on the whole send: open, insert and read-back share one signal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null)));
    const { openDirect, postMessage, sendBudget } = await import('@/lib/chat-actions');
    store.signals = [];
    store.rows.set('m-9', { id: 'm-9', created_at: '2026-11-10T14:21:00.000Z' });
    const budget = sendBudget();
    expect(await openDirect('u2', budget)).toBe('c-new');
    // m-9 is already saved: the insert is refused (23505) and the read-back runs, both on the same budget.
    expect((await postMessage('c-new', 'Hi', { id: 'm-9', signal: budget })).id).toBe('m-9');
    expect(store.signals.length).toBe(3);
    expect(store.signals.every((x) => x === budget)).toBe(true);
    // Without a budget, the insert and its read-back still share one.
    store.signals = [];
    await postMessage('c-new', 'Hi', { id: 'm-9' });
    expect(store.signals.length).toBe(2);
    expect(store.signals[0]).toBe(store.signals[1]);
    vi.unstubAllGlobals();
  });
});

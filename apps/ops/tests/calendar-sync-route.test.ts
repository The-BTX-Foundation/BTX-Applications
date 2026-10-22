import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verify, load } = vi.hoisted(() => ({
  verify: vi.fn<(header: string | null) => Promise<{ ok: boolean }>>(async () => ({ ok: false })),
  load: vi.fn(async () => ({
    events: [], tasks: [], assignees: [], cycles: [], bookings: [], slots: [], pairings: [], apps: [], people: [], milestones: [],
    posts: [{ id: 'p1', title: 'Winner reveal', post_on: new Date().toISOString().slice(0, 10) }],
  })),
}));
vi.mock('@/lib/calendar-sync/verify-caller', () => ({ verifySyncCaller: verify }));
vi.mock('@/lib/calendar-sync/load-rows', () => ({ loadSyncRows: load }));

import { GET } from '@/app/api/calendar-sync/route';

const call = (auth?: string) => GET(new Request('https://ops.example.org/api/calendar-sync', { headers: auth ? { authorization: auth } : {} }));

describe('GET /api/calendar-sync', () => {
  beforeEach(() => {
    verify.mockClear();
    load.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('answers 401 when the caller is not the sync script, without reading anything', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(verify).toHaveBeenCalledWith(null);
    expect(load).not.toHaveBeenCalled();
  });

  it('answers 503 with a fixed body when a read fails, and logs no detail', async () => {
    verify.mockResolvedValueOnce({ ok: true });
    load.mockRejectedValueOnce(new Error('relation tasks: secret detail Zephyrine'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('Bearer t');
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'unavailable' });
    expect(text).not.toContain('secret');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret');
  });

  it('answers 200 with the version 1 feed', async () => {
    verify.mockResolvedValueOnce({ ok: true });
    const res = await call('Bearer t');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(verify).toHaveBeenCalledWith('Bearer t');
    const body = await res.json();
    expect(body).toMatchObject({ version: 1 });
    expect(body.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.windowEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ id: 'post:p1', title: 'Post: Winner reveal', allDay: true });
    expect(Object.keys(body.events[0]).sort()).toEqual(['allDay', 'description', 'end', 'hash', 'id', 'location', 'start', 'title']);
  });
});

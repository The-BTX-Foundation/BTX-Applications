import { beforeEach, describe, expect, it, vi } from 'vitest';

// Route-level tests for POST /api/free-times with stand-in session and service clients. after() runs the work at once.
const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  insertError: null as { code: string } | null,
  serviceTables: [] as string[],
  pushed: 0,
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (work: () => unknown) => void work() }));

// The student's own session: who is signed in, and interview_free_times as RLS shows it (another student's row is
// invisible, so the read finds nothing and the insert is refused).
vi.mock('@/lib/supabase-server', () => ({
  sessionClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: h.insertError }),
    }),
  }),
}));

// The service role: records which tables were read. The cycle has no booking deadline.
vi.mock('@btx/data/server', () => ({
  createServiceClient: () => {
    const chain = (table: string) => {
      h.serviceTables.push(table);
      const data = table === 'applications' ? { cycle_id: 'c1', full_name: 'Ada Okafor', applicant_code: 'APP-1' } : table === 'cycles' ? { booking_closes_at: null } : table === 'staff_profiles' ? [{ user_id: 'u1' }] : [];
      const q: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'gte', 'limit', 'insert', 'update', 'delete']) q[k] = () => q;
      q.maybeSingle = async () => ({ data, error: null });
      q.single = async () => ({ data: { id: 'log1' }, error: null });
      q.then = (r: (v: unknown) => void) => r({ data, error: null });
      return q;
    };
    return { from: chain, auth: { admin: { getUserById: async () => ({ data: { user: { app_metadata: { role: 'admin' } } } }) } } };
  },
}));

vi.mock('@btx/push', async (orig) => ({ ...(await orig<typeof import('@btx/push')>()), deliverPush: async () => void h.pushed++ }));

import { POST } from '@/app/api/free-times/route';

const body = (applicationId: string) =>
  new Request('http://localhost/api/free-times', { method: 'POST', body: JSON.stringify({ applicationId, ranges: [{ day: '2026-11-15', start: '15:00', end: '22:00' }], said: 'Sunday' }) });

describe('POST /api/free-times', () => {
  beforeEach(() => {
    h.user = { id: 'student-1' };
    h.insertError = null;
    h.serviceTables = [];
    h.pushed = 0;
  });

  it('answers 401 to a signed-out request and touches nothing', async () => {
    h.user = null;
    const res = await POST(body('app-1'));
    expect(res.status).toBe(401);
    expect(h.serviceTables).toEqual([]);
  });

  it("refuses another student's application (RLS) and alerts nobody", async () => {
    h.insertError = { code: '42501' };
    const res = await POST(body('someone-elses-app'));
    expect(await res.json()).toEqual({ ok: false, kind: 'refused' });
    // only the deadline check ran: no email log, no staff list, no push
    expect(h.serviceTables).toEqual(['applications', 'cycles']);
    expect(h.pushed).toBe(0);
  });

  it('refuses a body with no usable range', async () => {
    const res = await POST(new Request('http://localhost/api/free-times', { method: 'POST', body: JSON.stringify({ applicationId: 'app-1', ranges: [{ day: 'x', start: '1', end: '2' }], said: '' }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, kind: 'failed' });
  });

  it('saves her own answer and then alerts the board', async () => {
    const res = await POST(body('app-1'));
    expect(await res.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(h.pushed).toBe(1));
    expect(h.serviceTables).toContain('staff_profiles');
  });
});

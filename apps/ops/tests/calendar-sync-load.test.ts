import { describe, expect, it } from 'vitest';
import type { ServiceClient } from '@btx/data/server';
import { readAll } from '@/lib/calendar-sync/load-rows';

type Call = { table: string; columns: string; eq: [string, string][]; order: string[]; from: number; to: number };

// A stand-in Supabase client over a fixed table. `cap` is the server's own row limit per page (PostgREST max-rows);
// `failOnPage` makes that page (1-based) answer with an error.
function stubClient(total: number, opts: { cap?: number; failOnPage?: number } = {}) {
  const calls: Call[] = [];
  const rows = Array.from({ length: total }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}` }));
  const db = {
    from(table: string) {
      const call: Call = { table, columns: '', eq: [], order: [], from: 0, to: 0 };
      const q = {
        select(columns: string) { call.columns = columns; return q; },
        eq(col: string, val: string) { call.eq.push([col, val]); return q; },
        order(col: string) { call.order.push(col); return q; },
        range(from: number, to: number) {
          call.from = from;
          call.to = to;
          calls.push(call);
          if (opts.failOnPage === calls.length) return Promise.resolve({ data: null, error: { message: 'boom' } });
          const size = Math.min(to - from + 1, opts.cap ?? Infinity);
          return Promise.resolve({ data: rows.slice(from, from + size), error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as ServiceClient, calls };
}

describe('readAll', () => {
  it('reads several full pages and stops on an empty one', async () => {
    const { db, calls } = stubClient(2500);
    const rows = await readAll(db, 'tasks', 'id', ['id']);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500);
    expect(calls.map((c) => [c.from, c.to])).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
  });

  it('keeps going after a short page when the server caps pages lower', async () => {
    const { db, calls } = stubClient(1200, { cap: 500 });
    const rows = await readAll(db, 'tasks', 'id', ['id']);
    expect(rows).toHaveLength(1200);
    expect(calls.map((c) => c.from)).toEqual([0, 500, 1000, 1200]);
  });

  it('throws when any page fails (never returns part of a table)', async () => {
    const { db } = stubClient(2500, { failOnPage: 2 });
    await expect(readAll(db, 'tasks', 'id', ['id'])).rejects.toThrow('calendar sync: could not read tasks');
  });

  it('gives up after 200 pages instead of paging forever', async () => {
    // 250,000 rows would take 250 pages: past the limit, so it stops at 200 and refuses.
    const { db, calls } = stubClient(250000);
    await expect(readAll(db, 'tasks', 'id', ['id'])).rejects.toThrow('calendar sync: too many pages in tasks');
    expect(calls).toHaveLength(200);
  });

  it('applies the filter and every order column on each page', async () => {
    const { db, calls } = stubClient(3);
    await readAll(db, 'task_assignees', 'task_id, user_id', ['task_id', 'user_id'], { status: 'active' });
    expect(calls[0]).toMatchObject({ table: 'task_assignees', columns: 'task_id, user_id', eq: [['status', 'active']], order: ['task_id', 'user_id'] });
    expect(calls.every((c) => c.order.join() === 'task_id,user_id')).toBe(true);
  });
});

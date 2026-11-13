// The Outreach Plan page's one write (components/oplan/oplan-writes.ts) with a stand-in client: exactly one row saves,
// "already exists" counts as saved, anything else (no row, two rows, an error, a throw) does not.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}) }));

import { insertPost, type PnDb } from '@/components/oplan/oplan-writes';

// A client whose insert answers with `res` (or throws), recording the row and the select.
function client(res: { data: { id: string }[] | null; error: unknown } | 'throw') {
  const seen: { table?: string; row?: Record<string, unknown>; cols?: string; signal?: AbortSignal } = {};
  const c: PnDb = {
    from: (t) => {
      seen.table = t;
      return {
        insert: (row) => {
          seen.row = row;
          return {
            select: (cols) => {
              seen.cols = cols;
              return {
                abortSignal: (s) => {
                  seen.signal = s;
                  return res === 'throw' ? Promise.reject(new Error('net')) : Promise.resolve(res);
                },
              };
            },
          };
        },
      };
    },
  };
  return { c, seen };
}

const P = { id: 'id-1', channelId: 'c1', title: 'Teaser', postOn: '2026-11-20', ownerId: null };

describe('insertPost', () => {
  it('saves with exactly one row back', async () => {
    const { c, seen } = client({ data: [{ id: 'id-1' }], error: null });
    expect(await insertPost(P, c)).toBe(true);
    expect(seen.table).toBe('posts');
    expect(seen.row).toEqual({ id: 'id-1', channel_id: 'c1', title: 'Teaser', post_on: '2026-11-20' });
    expect(seen.cols).toBe('id');
    expect(seen.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the owner when there is one', async () => {
    const { c, seen } = client({ data: [{ id: 'id-1' }], error: null });
    await insertPost({ ...P, ownerId: 'u1' }, c);
    expect(seen.row?.owner_id).toBe('u1');
  });

  it('counts "already exists" as saved', async () => {
    const { c } = client({ data: null, error: { code: '23505' } });
    expect(await insertPost(P, c)).toBe(true);
  });

  it('refuses no row, two rows, an error and a throw', async () => {
    expect(await insertPost(P, client({ data: [], error: null }).c)).toBe(false);
    expect(await insertPost(P, client({ data: [{ id: 'a' }, { id: 'b' }], error: null }).c)).toBe(false);
    expect(await insertPost(P, client({ data: null, error: { code: '42501' } }).c)).toBe(false);
    expect(await insertPost(P, client('throw').c)).toBe(false);
  });
});

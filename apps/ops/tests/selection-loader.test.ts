// The Selection loader in mock mode (no Supabase env): each ?demo= value draws the demo's state.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => false }));
vi.mock('@/lib/selection-db', () => ({ slSessionReader: { rows: vi.fn(), all: vi.fn() } }));

import { loadSelectionView } from '@/lib/selection-view-loader';

describe('loadSelectionView in mock mode', () => {
  it('draws each demo state', async () => {
    const get = async (demo?: string) => loadSelectionView({ demo, role: 'admin' });
    expect((await get('failed')).failed).toBe(true);
    const today = await get();
    const error = await get('error');
    const board = await get('board');
    const fail = await get('failsave');
    const empty = await get('empty');
    if (today.failed || error.failed || board.failed || fail.failed || empty.failed) throw new Error('unexpected');
    expect(today.rows).toEqual([]);
    expect(error.loadFailed).toBe(true);
    expect(board.caps.release).toBe(false);
    expect(fail.failFirst).toBe(true);
    expect(empty.cycle?.total).toBe(0);
  });
});

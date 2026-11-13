// Live mode ignores every ?demo flag (lib/budget-view-loader.ts): it always reads the real tables as the signed-in person.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const live = vi.fn();
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/budget-live', () => ({ loadLiveBudgetView: (...a: unknown[]) => live(...a) }));
vi.mock('@/lib/budget-db', () => ({ sessionReader: { rows: vi.fn(), all: vi.fn() } }));

import { loadBudgetView } from '@/lib/budget-view-loader';

describe('loadBudgetView in live mode', () => {
  beforeEach(() => {
    live.mockReset();
    live.mockResolvedValue({ live: true });
  });
  it.each(['failed', 'error', 'stress', 'empty', 'loading', undefined])('ignores ?demo=%s', async (demo) => {
    const v = await loadBudgetView({ demo, me: 'u1' });
    expect(v).toEqual({ live: true });
    expect(live).toHaveBeenCalledTimes(1);
    expect(live.mock.calls[0][1]).toBe('u1');
  });
  it('passes the approval page\'s ?plan= through (and ?demo=unavailable is ignored)', async () => {
    await loadBudgetView({ demo: 'unavailable', me: 'u1', plan: 'p9' });
    expect(live.mock.calls[0][3]).toBe('p9');
  });
});

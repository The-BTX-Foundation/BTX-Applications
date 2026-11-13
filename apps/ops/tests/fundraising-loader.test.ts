// Live mode ignores every ?demo flag (lib/fundraising-view-loader.ts), and the live board draws no control (frControls).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const live = vi.fn();
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/fundraising-live', () => ({ loadLiveFundraisingView: (...a: unknown[]) => live(...a) }));
vi.mock('@/lib/fundraising-db', () => ({ fundraisingReader: { rows: vi.fn(), all: vi.fn() } }));

import { loadFundraisingView } from '@/lib/fundraising-view-loader';
import { frControls } from '@/lib/fundraising-map';

describe('loadFundraisingView in live mode', () => {
  beforeEach(() => {
    live.mockReset();
    live.mockResolvedValue({ live: true });
  });
  it.each(['failed', 'error', 'nolist', 'stress', 'empty', 'loading', undefined])('ignores ?demo=%s', async (demo) => {
    const v = await loadFundraisingView({ demo, me: 'u1' });
    expect(v).toEqual({ live: true });
    expect(live).toHaveBeenCalledTimes(1);
    expect(live.mock.calls[0][1]).toBe('u1');
  });
});

describe('frControls', () => {
  it('live mode draws no gift form, no Undo, no tick buttons, no Nudge, and the N key does nothing', async () => {
    const real = await vi.importActual<typeof import('@/lib/fundraising-live')>('@/lib/fundraising-live');
    const c = frControls(real.liveCaps());
    expect(c).toEqual({ giftForm: false, nKey: false, giftUndo: false, tickButtons: false, stepUndo: false, nudge: false });
  });
  it('mock mode draws every control, and none of the gift ones over a load error', () => {
    const all = { logGift: true, giftUndo: true, tick: true, nudge: true };
    expect(Object.values(frControls(all)).every(Boolean)).toBe(true);
    expect(frControls(all, true)).toMatchObject({ giftForm: false, nKey: false });
  });
});

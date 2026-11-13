// The Cycle loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every ?demo=
// value is ignored and the page reads the real tables (here a stand-in reader), so no demo flag can switch a write on,
// fake a load error or fake a failed send live.
import { describe, expect, it, vi } from 'vitest';
import type { CyReader } from '@/lib/cycle-live';
import type { Row } from '@/lib/cycle-map';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/cycle-db', () => {
  const tables: Record<string, Row[]> = {
    staff_profiles: [{ user_id: 'u1', display_name: 'Dana Mercer', initials: 'DM' }],
    chat_channels: [{ id: 'ch1' }],
    chat_messages: [],
    cycles: [{ id: 'c1', term: 'Fall 2026', opens_at: '2026-10-12T04:00:00.000Z', closes_at: '2026-11-07T04:59:00.000Z' }],
    applications: [{ id: 'a1' }],
    bookings: [],
    application_score_summary: [],
    checklists: [],
  };
  const read = async (table: string) => tables[table] ?? [];
  const cySessionReader: CyReader = { rows: read, all: read };
  return { cySessionReader };
});

const USER = { id: 'u1', name: 'Dana Mercer', initials: 'DM', role: 'admin' };

describe('loadCycleView in live mode', () => {
  it.each(['error', 'failed', 'listerror', 'chaterror', 'uncounted', 'failsend', 'longnames', 'stress', 'empty', 'loading', undefined])('ignores ?demo=%s: real data, no fake failure, demo writes off', async (demo) => {
    const { loadCycleView } = await import('@/lib/cycle-view-loader');
    const v = await loadCycleView({ demo, user: USER });
    expect(v.loadFailed).toBe(false);
    expect(v.listFailed).toBe(false);
    expect(v.chat.failed).toBe(false);
    expect(v.cycle).toMatchObject({ title: 'Fall 2026 cycle', applied: 1, booked: 0, scored: 0 });
    expect(v.failFirst?.send ?? false).toBe(false);
    expect([v.caps.remind, v.caps.share, v.caps.tick, v.caps.nudge]).toEqual([false, false, false, false]);
  });
});

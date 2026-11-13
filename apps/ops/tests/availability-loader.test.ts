// The Your availability loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present,
// every ?demo= value is ignored and the page reads the signed-in person's own rows (here a stand-in reader), so no flag
// can fake a state live; bookings stay hidden live. Reads are paged in a unique order. A failed read is the load error
// (never an empty page) and logs one server line with the table and code only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvReader, AvReadOpts, Row } from '@/lib/availability-live';

const db = vi.hoisted(() => ({ fail: null as null | { table: string; code: string }, calls: [] as { table: string; o?: unknown; paged: boolean }[] }));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/availability-db', () => {
  const tables: Record<string, Row[]> = {
    cycles: [{ id: 'c1', term: 'Fall 2026', closes_at: '2026-11-06T04:59:00Z', interview_start: '2026-11-10', interview_end: '2026-11-20' }],
    board_free_ranges: [{ day: '2026-11-12', start_min: 1020, end_min: 1260 }],
    board_interview_prefs: [{ max_interviews: 4, availability_text: 'Weekday evenings', availability_sent_at: '2026-11-02T23:14:00Z' }],
    board_conflicts: [{ id: 'k1', name: 'Jordan Pierce', created_at: '2026-11-01' }],
  };
  const read = (paged: boolean) => async (table: string, _s: string, o?: AvReadOpts) => {
    db.calls.push({ table, o, paged });
    if (db.fail?.table === table) throw { code: db.fail.code, message: 'Jordan Pierce row was refused' };
    return tables[table] ?? [];
  };
  const avSessionReader: AvReader = { rows: read(false), all: read(true) };
  return { avSessionReader };
});

afterEach(() => {
  db.fail = null;
  db.calls = [];
  vi.restoreAllMocks();
});

const user = { id: 'u-me', initials: 'DM' };

describe('loadAvailabilityView in live mode', () => {
  it.each(['failed', 'error', 'stress', 'empty', 'nodates', 'failsend', 'loading', undefined])('ignores ?demo=%s: real rows, no fake state, bookings hidden', async (demo) => {
    const { loadAvailabilityView } = await import('@/lib/availability-view-loader');
    const r = await loadAvailabilityView({ demo, user });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.noDates).toBe(false);
    expect(r.failFirst.send).toBe(false);
    expect(r.term).toBe('Fall 2026');
    expect(r.days[0]).toBe('2026-11-10');
    expect(r.ranges).toEqual([{ day: '2026-11-12', startMin: 1020, endMin: 1260 }]);
    expect(r.maxInterviews).toBe(4);
    expect(r.conflicts).toEqual(['Jordan Pierce']);
    expect(r.bookings).toEqual([]);
    expect(r.caps).toEqual({ send: true, reader: true, bookings: false, mock: false });
    expect(r.dueOn).toBe('2026-11-05');
  });

  it('pages the lists in a unique order and filters to the signed-in person', async () => {
    const { loadAvailabilityView } = await import('@/lib/availability-view-loader');
    await loadAvailabilityView({ user });
    const ranges = db.calls.find((c) => c.table === 'board_free_ranges');
    expect(ranges?.paged).toBe(true);
    expect(ranges?.o).toMatchObject({ eq: { cycle_id: 'c1', user_id: 'u-me' }, order: [['day', true], ['start_min', true]] });
    expect(db.calls.find((c) => c.table === 'board_conflicts')?.o).toMatchObject({ order: [['created_at', true], ['id', true]] });
    expect(db.calls.find((c) => c.table === 'cycles')?.o).toMatchObject({ order: [['created_at', false], ['id', false]], limit: 1 });
  });

  it('a failed read is the load error, logged with the table and code only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'board_conflicts', code: '42501' };
    const { loadAvailabilityView } = await import('@/lib/availability-view-loader');
    const r = await loadAvailabilityView({ demo: 'stress', user });
    expect(r.failed === false && r.loadFailed).toBe(true);
    expect(r.failed === false && r.conflicts).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[availability] read failed', { table: 'board_conflicts', code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Jordan');
  });
});

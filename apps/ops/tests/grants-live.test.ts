// Live Grants loading (lib/grants-live.ts) against a stand-in reader: a failed core read is the page's load error (never
// "0 grants"), a failed checklist read marks only the checklist, assignees are read in chunks of 100, and the mock
// loader's ?demo= flags.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grants-map';
import { loadLiveGrantsView, type GrantsReader, type GrantsReadOpts } from '@/lib/grants-live';
import { mockGrantsView } from '@/lib/grants-view-loader';

const NOW = new Date('2026-11-10T15:00:00Z');
const TASKS = Array.from({ length: 150 }, (_, i) => ({ id: `t${String(i).padStart(3, '0')}`, title: `Step ${i}`, position: i, status: i === 0 ? 'done' : 'open', note: 'List' }));
const TABLES: Record<string, Row[]> = {
  grants: [
    { id: 'g2', name: 'Community fund', stage: 'researching', amount_cents: 500_000, date_note: 'Opens in January', created_at: '2026-10-02' },
    { id: 'g1', name: 'STEM education grant', stage: 'writing', amount_cents: 1_000_000, amount_is_up_to: true, deadline_on: '2026-12-01', owner_id: 'u-kd', created_at: '2026-10-01' },
  ],
  staff_profiles: [
    { user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' },
    { user_id: 'u-kd', display_name: 'Keith Dawson', initials: 'KD' },
  ],
  checklists: [{ id: 'cl1', title: 'Getting started with grants', created_at: '2026-10-01' }],
  tasks: TASKS,
  task_assignees: [{ task_id: 't001', user_id: 'u-me' }],
};

type Call = { table: string; o: GrantsReadOpts };

// A reader over TABLES that records each read; `fail` lists tables whose read throws.
function reader(fail: string[] = [], calls: Call[] = []): GrantsReader {
  return {
    me: async () => 'u-me',
    all: async (table, _select, o) => {
      calls.push({ table, o });
      if (fail.includes(table)) throw new Error(`${table} failed`);
      let rows = TABLES[table] ?? [];
      for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
      return rows;
    },
  };
}

describe('loadLiveGrantsView', () => {
  it('builds the view, read-only, with a stable order on every read', async () => {
    const calls: Call[] = [];
    const v = await loadLiveGrantsView(reader([], calls), NOW);
    if (v.failed) throw new Error('unexpected');
    expect(v.loadFailed).toBe(false);
    expect(v.today).toBe('2026-11-10');
    expect(v.grants.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(v.grants[0].owner).toMatchObject({ name: 'Keith Dawson', me: false });
    expect(v.counts).toEqual({ researching: 1, writing: 1, submitted: 0, decided: 0 });
    expect(v.checklist?.steps).toHaveLength(150);
    expect(v.checklist?.steps[1].who).toMatchObject({ name: 'Dana Mercer', me: true });
    expect(Object.values(v.caps).some(Boolean)).toBe(false);
    expect(v.budgetCount).toBeNull();
    for (const c of calls) expect(c.o.order.length).toBeGreaterThan(0);
  });

  it('reads the assignees in chunks of 100 task ids', async () => {
    const calls: Call[] = [];
    await loadLiveGrantsView(reader([], calls), NOW);
    const parts = calls.filter((c) => c.table === 'task_assignees').map((c) => (c.o.in?.task_id ?? []).length);
    expect(parts).toEqual([100, 50]);
  });

  it('shows the load error when grants or people fail, never zero grants', async () => {
    for (const t of ['grants', 'staff_profiles']) {
      const v = await loadLiveGrantsView(reader([t]), NOW);
      if (v.failed) throw new Error('unexpected');
      expect(v.loadFailed).toBe(true);
    }
  });

  it('marks only the checklist when its read fails', async () => {
    for (const t of ['checklists', 'tasks', 'task_assignees']) {
      const v = await loadLiveGrantsView(reader([t]), NOW);
      if (v.failed) throw new Error('unexpected');
      expect(v.loadFailed).toBe(false);
      expect(v.checklist).toBeNull();
      expect(v.grants).toHaveLength(2);
    }
  });

  it('has no steps when the checklist does not exist yet', async () => {
    const r = reader();
    const v = await loadLiveGrantsView({ ...r, all: (t, s, o) => (t === 'checklists' ? Promise.resolve([]) : r.all(t, s, o)) }, NOW);
    if (v.failed) throw new Error('unexpected');
    expect(v.checklist).toEqual({ title: 'Getting started with grants', steps: [] });
  });
});

describe('mockGrantsView', () => {
  it('maps every ?demo= flag', () => {
    expect(mockGrantsView('failed')).toEqual({ failed: true });
    const n = mockGrantsView();
    const s = mockGrantsView('stress');
    const e = mockGrantsView('empty');
    if (n.failed || s.failed || e.failed) throw new Error('unexpected');
    expect(n.grants).toHaveLength(2);
    expect(s.counts.researching).toBe(120);
    expect(e.grants).toHaveLength(0);
    expect(n.caps.add).toBe(true);
    const err = mockGrantsView('error');
    const se = mockGrantsView('steperror');
    if (err.failed || se.failed) throw new Error('unexpected');
    expect(err.loadFailed).toBe(true);
    expect(se.checklist).toBeNull();
    expect(se.loadFailed).toBe(false);
  });
});

// Live Fundraising loading (lib/fundraising-live.ts) against a stand-in reader: a failed core read is the page's load
// error (never "$0 raised"), a failed checklist read empties only that panel, id lists are chunked, and the reads ask for
// every page of gifts.
import { describe, expect, it } from 'vitest';
import type { ReadOpts, Row } from '@/lib/daily-db';
import { CHECKLIST_TITLE, ID_CHUNK, liveCaps, loadLiveFundraisingView, readChecklist, type FrReader } from '@/lib/fundraising-live';

const NOW = new Date('2026-11-10T15:00:00Z');
const TABLES: Record<string, Row[]> = {
  gifts: [
    { id: 'x1', gift_on: '2026-03-01', amount_cents: 500_000, source: 'individual', donor_id: 'd1' },
    { id: 'x2', gift_on: '2026-11-02', amount_cents: 480_000, source: 'corporate', donor_id: 'd2', monthly: true },
  ],
  goals: [{ target_cents: 1_500_000 }],
  donors: [{ id: 'd1', name: 'Ana Ruiz' }, { id: 'd2', name: 'Acme Corp' }],
  checklists: [{ id: 'cl1', title: CHECKLIST_TITLE }],
  tasks: [
    { id: 't1', title: 'Set the goal', note: 'Goal', status: 'done', position: 1, due_on: '2026-10-02' },
    { id: 't2', title: 'Draft the donor letter', note: 'Letter', status: 'open', position: 2, due_on: '2026-11-13' },
  ],
  task_assignees: [{ task_id: 't2', user_id: 'u1' }],
  staff_profiles: [{ user_id: 'u1', display_name: 'Keith Dawson', initials: 'KD' }],
};

type Call = { kind: 'rows' | 'all'; table: string; o?: ReadOpts; then?: string[] };

// A reader over TABLES that logs every call; `fail` lists tables whose read throws, `override` replaces a table's rows.
function reader(fail: string[] = [], override: Record<string, Row[]> = {}) {
  const calls: Call[] = [];
  const get = (kind: Call['kind']) => async (table: string, _s: string, o?: ReadOpts, then?: string[]) => {
    calls.push({ kind, table, o, then });
    if (fail.includes(table)) throw new Error(`${table} failed`);
    return override[table] ?? TABLES[table] ?? [];
  };
  const r: FrReader = { rows: get('rows'), all: get('all') };
  return { r, calls };
}

describe('loadLiveFundraisingView', () => {
  it('builds the page from every read, read-only', async () => {
    const { r, calls } = reader();
    const v = await loadLiveFundraisingView(r, 'u9', NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect([v.today, v.year, v.goalCents, v.raisedCents, v.donors]).toEqual(['2026-11-10', 2026, 1_500_000, 980_000, 2]);
    expect(v.recent.map((g) => [g.id, g.donor])).toEqual([['x2', 'Acme Corp'], ['x1', 'Ana Ruiz']]);
    expect(v.checklist?.steps.map((s) => s.owner.kind)).toEqual(['none', 'person']);
    expect(v.caps).toEqual(liveCaps());
    expect(Object.values(v.caps).every((c) => c === false)).toBe(true);
    expect(v.budgetCount).toBeNull();
    // Gifts are paged ("all"), never a single capped read.
    expect(calls.find((c) => c.table === 'gifts')?.kind).toBe('all');
  });
  it.each(['gifts', 'goals', 'donors'])('a failed %s read is the load error, never "$0 raised"', async (t) => {
    const { r } = reader([t]);
    const v = await loadLiveFundraisingView(r, 'u9', NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(true);
    expect(v.recent).toEqual([]);
    expect(v.goalCents).toBeNull();
  });
  it.each(['checklists', 'tasks', 'task_assignees', 'staff_profiles'])('a failed %s read empties only the checklist', async (t) => {
    const { r } = reader([t]);
    const v = await loadLiveFundraisingView(r, 'u9', NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.checklist).toBeNull();
    expect(v.raisedCents).toBe(980_000);
  });
  it('picks the money goal by position, then id', async () => {
    const goals = [
      { id: 'b', position: 2, target_cents: 2 },
      { id: 'z', position: 1, target_cents: 9 },
      { id: 'a', position: 1, target_cents: 7 },
    ];
    const { r } = reader([], { goals });
    const v = await loadLiveFundraisingView(r, 'u9', NOW);
    if (v.failed) throw new Error('failed');
    expect(v.goalCents).toBe(7);
  });
  it('no goal row is "no goal set", not a zero goal', async () => {
    const { r } = reader([], { goals: [] });
    const v = await loadLiveFundraisingView(r, 'u9', NOW);
    if (v.failed) throw new Error('failed');
    expect(v.goalCents).toBeNull();
  });
  it('asks donor names only for the five gifts on screen', async () => {
    const gifts = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, gift_on: `2026-10-0${i + 1}`, amount_cents: 100, donor_id: `d${i}` }));
    const { r, calls } = reader([], { gifts });
    await loadLiveFundraisingView(r, 'u9', NOW);
    const asked = calls.filter((c) => c.table === 'donors').flatMap((c) => (c.o?.in?.id ?? []) as string[]);
    expect(asked.sort()).toEqual(['d3', 'd4', 'd5', 'd6', 'd7']);
  });
});

describe('readChecklist', () => {
  it('no checklist is an empty list', async () => {
    const { r } = reader([], { checklists: [] });
    expect(await readChecklist(r)).toEqual({ title: CHECKLIST_TITLE, steps: [] });
  });
  it('chunks long id lists', async () => {
    const tasks = Array.from({ length: ID_CHUNK * 2 + 5 }, (_, i) => ({ id: `t${i}`, title: 'x', status: 'open', position: i }));
    const { r, calls } = reader([], { tasks });
    await readChecklist(r);
    const parts = calls.filter((c) => c.table === 'task_assignees').map((c) => ((c.o?.in?.task_id ?? []) as string[]).length);
    expect(parts).toEqual([ID_CHUNK, ID_CHUNK, 5]);
    // Assignees page in the order of their unique key: task_id, then user_id.
    const a = calls.find((c) => c.table === 'task_assignees');
    expect([a?.o?.order, a?.then]).toEqual([['task_id', true], ['user_id']]);
  });
});

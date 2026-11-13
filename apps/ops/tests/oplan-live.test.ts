// Outreach Plan live reads with a stand-in reader (lib/oplan-live.ts): the window, undated items, and any failure to the
// load error (never an empty plan).
import { describe, expect, it } from 'vitest';
import { loadLiveOplanView, windowOf, type PnReader, type PnReadOpts } from '@/lib/oplan-live';

type Row = Record<string, unknown>;
const NOW = new Date('2026-11-10T15:00:00Z');

// A reader answering from `tables` with the filters applied; `fail` names tables that throw; calls are recorded.
function reader(tables: Record<string, Row[]>, fail: string[] = []) {
  const calls: { table: string; o: PnReadOpts }[] = [];
  const r: PnReader = {
    all: async (table, _s, o) => {
      calls.push({ table, o });
      if (fail.includes(table)) throw new Error('no');
      let rows = tables[table] ?? [];
      for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((x) => x[c] === v);
      for (const [c, v] of Object.entries(o.neq ?? {})) rows = rows.filter((x) => x[c] !== v);
      for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((x) => v.includes(x[c]));
      for (const [c, v] of Object.entries(o.gte ?? {})) rows = rows.filter((x) => x[c] != null && String(x[c]) >= String(v));
      for (const [c, v] of Object.entries(o.lt ?? {})) rows = rows.filter((x) => x[c] != null && String(x[c]) < String(v));
      for (const c of o.isNull ?? []) rows = rows.filter((x) => x[c] == null);
      return rows;
    },
  };
  return { r, calls };
}

const TABLES: Record<string, Row[]> = {
  staff_profiles: [{ user_id: 'u1', display_name: 'Dana Mercer', initials: 'DM' }],
  outreach_channels: [
    { id: 'c1', kind: 'instagram', name: 'Instagram', target: '4 a month', position: 1 },
    { id: 'c2', kind: 'newsletter', name: 'Newsletter', position: 2 },
  ],
  posts: [
    { id: 'p-old', title: 'October', post_on: '2026-10-20', status: 'posted' },
    { id: 'p-now', title: 'Teaser', post_on: '2026-11-20', status: 'not_started' },
    { id: 'p-far', title: 'January', post_on: '2027-01-05', status: 'not_started' },
    { id: 'p-und', title: 'Someday', post_on: null, status: 'drafting' },
    { id: 'p-und-done', title: 'Done undated', post_on: null, status: 'posted' },
  ],
  newsletter_issues: [{ id: 'i1', title: 'Dec issue', send_on: '2026-12-01', status: 'drafting' }],
  newsletter_sections: [{ id: 's1', issue_id: 'i1', status: 'done' }],
};

describe('loadLiveOplanView', () => {
  it('reads this month and next, plus undated items not yet out', async () => {
    const { r } = reader(TABLES);
    const v = await loadLiveOplanView(r, 'u1', NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.today).toBe('2026-11-10');
    expect(v.items.map((x) => x.id).sort()).toEqual(['i1', 'p-now', 'p-und']);
    expect(v.items.find((x) => x.id === 'i1')?.sections).toEqual({ done: 1, of: 1 });
    expect(v.instagramId).toBe('c1');
    expect(v.caps.nudge).toBe(false);
  });

  it('sets the window to two months', () => {
    expect(windowOf('2026-11-10')).toEqual({ from: '2026-11-01', to: '2027-01-01' });
  });

  it('shows the load error when any read fails', async () => {
    for (const t of ['staff_profiles', 'outreach_channels', 'posts', 'newsletter_issues', 'newsletter_sections']) {
      const { r } = reader(TABLES, [t]);
      const v = await loadLiveOplanView(r, 'u1', NOW);
      expect(v.failed).toBe(false);
      if (!v.failed) {
        expect(v.loadFailed).toBe(true);
        expect(v.items).toEqual([]);
        expect(v.caps.addPost).toBe(false);
      }
    }
  });

  it('orders every read uniquely for paging', async () => {
    const { r, calls } = reader(TABLES);
    await loadLiveOplanView(r, 'u1', NOW);
    for (const c of calls) expect(c.o.order.length).toBeGreaterThan(0);
  });
});

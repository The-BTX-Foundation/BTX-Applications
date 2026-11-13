// Live Sponsorships loading (lib/sponsorships-live.ts) against a stand-in reader, and the mock flags
// (lib/sponsorships-view-loader.ts mockSponsors).
import { describe, expect, it } from 'vitest';
import { loadLiveSponsorsView, type SponsorsReader } from '@/lib/sponsorships-live';
import { HOW_LIVE } from '@/lib/sponsorships-map';
import { loadSponsorsView, mockSponsors } from '@/lib/sponsorships-view-loader';

const NOW = new Date('2026-11-10T15:00:00Z');

describe('loadLiveSponsorsView', () => {
  it('reads this year and the undated rows, and shows no mock names or Undo', async () => {
    const asked: unknown[] = [];
    const read: SponsorsReader = async (f) => {
      asked.push(f);
      return 'year' in f
        ? [{ id: 's1', title: 'NSBE', kind: 'conference', students: 3, amount_cents: 60_000, when_label: '', occurred_on: '2026-12-05', status: 'done' }]
        : [{ id: 's0', title: 'Old', kind: 'fee', students: 0, amount_cents: 100, when_label: 'Spring', occurred_on: null, status: 'done' }];
    };
    const v = await loadLiveSponsorsView(read, NOW);
    expect(asked).toEqual([{ year: 2026 }, { undated: true }]);
    if (v.failed) throw new Error('unexpected');
    expect(v.year).toBe(2026);
    expect(v.today).toBe('2026-11-10');
    expect(v.rows.map((r) => r.id)).toEqual(['s1', 's0']);
    expect(v.caps).toEqual({ log: true, undo: false });
    expect(v.how).toBe(HOW_LIVE);
    expect(JSON.stringify(v.how)).not.toContain('Dana');
    expect(v.loadFailed).toBe(false);
    expect(v.mockWrite).toBeNull();
  });
  it('a failed read is the load error, never an empty year', async () => {
    const v = await loadLiveSponsorsView(async () => {
      throw new Error('down');
    }, NOW);
    if (v.failed) throw new Error('unexpected');
    expect(v.loadFailed).toBe(true);
    expect(v.rows).toEqual([]);
  });
});

describe('mockSponsors', () => {
  it('maps every demo flag', () => {
    expect(mockSponsors('failed')).toEqual({ failed: true });
    const n = mockSponsors();
    if (n.failed) throw new Error('unexpected');
    expect(n.rows).toHaveLength(1);
    expect(n.loadFailed).toBe(false);
    const s = mockSponsors('stress');
    if (s.failed) throw new Error('unexpected');
    expect(s.rows).toHaveLength(2);
    const e = mockSponsors('empty');
    if (e.failed) throw new Error('unexpected');
    expect(e.rows).toHaveLength(0);
    const er = mockSponsors('error');
    if (er.failed) throw new Error('unexpected');
    expect(er.loadFailed).toBe(true);
    for (const m of ['failsave', 'unsure'] as const) {
      const r = mockSponsors(m);
      if (r.failed) throw new Error('unexpected');
      expect(r.mockWrite).toBe(m);
    }
  });
  it('the loader uses the mock without Supabase env', async () => {
    expect(await loadSponsorsView({ demo: 'failed' }, false)).toEqual({ failed: true });
  });
  it('with Supabase env every demo flag is inert and there is no Undo', async () => {
    const read: SponsorsReader = async () => [];
    for (const demo of [undefined, 'failed', 'error', 'stress', 'empty', 'failsave', 'unsure', 'loading']) {
      const v = await loadSponsorsView({ demo }, true, read);
      expect(v.failed).toBe(false);
      if (v.failed) continue;
      expect(v.loadFailed).toBe(false);
      expect(v.mockWrite).toBeNull();
      expect(v.rows).toEqual([]);
      expect(v.caps).toEqual({ log: true, undo: false });
      expect(JSON.stringify(v)).not.toContain('Dana');
    }
  });
});

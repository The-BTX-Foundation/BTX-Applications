// Live Goals loading (lib/goals-live.ts) against a stand-in reader: a failed money read is the page's load error, a failed
// counting read is "Couldn't count" on its goals only, and the money sum reads every page.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/daily-db';
import { pageAll } from '@/lib/goals-map';
import { loadLiveGoalsView, SMALL_CAP, type GoalsReader } from '@/lib/goals-live';

const NOW = new Date('2026-11-10T15:00:00Z');
const GOALS = [
  { id: 'g1', year: 2026, title: 'Raise $15,000', metric: 'money_raised', status: 'on_track', target_cents: 1_500_000, position: 1 },
  { id: 'g2', year: 2026, title: 'Stay on budget', metric: 'budget_spent', status: 'on_track', target_cents: 850_000, position: 2 },
  { id: 'g3', year: 2026, title: 'Certification', metric: 'checklist', status: 'in_planning', checklist_id: 'cl1', position: 3 },
  { id: 'g4', year: 2026, title: 'Award', metric: 'applicants_scored', status: 'on_track', position: 4 },
];
const TABLES: Record<string, Row[]> = {
  goals: GOALS,
  year_figures: [],
  scholarship_awards: [{ id: 'a1', past_term: 'Spring 2021' }],
  cycles: [{ id: 'c9', term: 'Fall', year: 2026, status: 'published', decision_date: '2026-11-30' }],
  gifts: [{ id: 'x1', amount_cents: 500_000 }, { id: 'x2', amount_cents: 480_000 }],
  budget_category_totals: [{ budget_cents: 850_000, spent_cents: 367_000 }],
  tasks: [{ id: 't1', checklist_id: 'cl1', status: 'done' }, { id: 't2', checklist_id: 'cl1', status: 'open' }],
  applications: [{ id: 'p1', cycle_id: 'c9' }, { id: 'p2', cycle_id: 'c9' }],
  application_score_summary: [{ application_id: 'p1', published_count: 2 }],
};

// A reader over TABLES; `fail` lists tables whose read throws, `override` replaces a table's rows.
function reader(fail: string[] = [], override: Record<string, Row[]> = {}): GoalsReader {
  const get = async (t: string) => {
    if (fail.includes(t)) throw new Error(`${t} failed`);
    return override[t] ?? TABLES[t] ?? [];
  };
  return { rows: get, all: get };
}

describe('loadLiveGoalsView', () => {
  it('counts the goals from every read', async () => {
    const v = await loadLiveGoalsView(reader(), NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.goals.map((g) => [g.id, g.have, g.of, g.uncounted ?? false])).toEqual([
      ['g1', 980_000, 1_500_000, false],
      ['g2', 367_000, 850_000, false],
      ['g3', 1, 2, false],
      ['g4', 1, 2, false],
    ]);
  });
  it.each(['gifts', 'budget_category_totals', 'goals', 'year_figures', 'scholarship_awards', 'cycles'])('a failed %s read is the load error, never "$0 raised"', async (t) => {
    const v = await loadLiveGoalsView(reader([t]), NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(true);
    expect(v.goals).toEqual([]);
  });
  it('a failed steps read marks only the checklist goal "couldn\'t count"', async () => {
    const v = await loadLiveGoalsView(reader(['tasks']), NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.goals.map((g) => g.uncounted ?? false)).toEqual([false, false, true, false]);
  });
  it.each(['applications', 'application_score_summary'])('a failed %s read marks the scoring goal, never "0 of 0"', async (t) => {
    const v = await loadLiveGoalsView(reader([t]), NOW);
    if (v.failed) throw new Error('failed');
    expect(v.goals.map((g) => g.uncounted ?? false)).toEqual([false, false, false, true]);
  });
  it('awards or cycles at the cap fail the page rather than draw a partial history', async () => {
    const many = Array.from({ length: SMALL_CAP }, (_, i) => ({ id: `a${i}`, past_term: 'Spring 2021' }));
    const v = await loadLiveGoalsView(reader([], { scholarship_awards: many }), NOW);
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(true);
  });
  it('sums gifts across pages (more than 1,000 gifts in a year)', async () => {
    const gifts = Array.from({ length: 2345 }, (_, i) => ({ id: `x${i}`, amount_cents: 100 }));
    const r = reader();
    const paged: GoalsReader = {
      ...r,
      all: (t, s, o) => (t === 'gifts' ? pageAll(async (from, to) => gifts.slice(from, to + 1)) : r.all(t, s, o)),
    };
    const v = await loadLiveGoalsView(paged, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.goals[0].have).toBe(234_500);
  });
  it('reads scores 100 application ids at a time and counts them all', async () => {
    const apps = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}`, cycle_id: 'c9' }));
    const scores = apps.map((a) => ({ application_id: a.id, published_count: 2 }));
    const sizes: number[] = [];
    const r = reader([], { applications: apps });
    const spy: GoalsReader = {
      ...r,
      all: async (t, s, o) => {
        if (t !== 'application_score_summary') return r.all(t, s, o);
        const ids = (o?.in?.application_id ?? []) as string[];
        sizes.push(ids.length);
        return scores.filter((x) => ids.includes(x.application_id));
      },
    };
    const v = await loadLiveGoalsView(spy, NOW);
    if (v.failed) throw new Error('failed');
    expect(sizes).toEqual([100, 100, 50]);
    expect(v.goals[3]).toMatchObject({ have: 250, of: 250 });
  });
});

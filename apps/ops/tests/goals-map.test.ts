// The refreshed Goals page's pure logic (lib/goals-map.ts): goal rows, award-cycle bars, the year mark, the figure boxes.
import { describe, expect, it } from 'vitest';
import type { GoalFacts } from '@/lib/daily-goals';
import {
  awardNote,
  count,
  cycleRows,
  cyclesTotal,
  figureKey,
  firstOpenFigure,
  goalRow,
  goalsNews,
  MAX_APPLICANTS,
  MAX_MONEY_DOLLARS,
  mapFigures,
  money,
  moneyUp,
  pageAll,
  parseFigure,
  parseKey,
  yearDone,
} from '@/lib/goals-map';
import type { GoalRow } from '@/lib/goals-view';

const TODAY = '2026-11-10';
const FACTS: GoalFacts = {
  year: 2026,
  raisedCents: 980_000,
  spentCents: 300_000,
  budgetCents: 1_000_000,
  checklistSteps: { cl1: { done: 1, total: 5 } },
  cycleScores: { c9: { scored: 3, applications: 18, decisionDate: '2026-11-30' } },
  currentCycleId: 'c9',
};

describe('money and count', () => {
  it('shows whole dollars from cents and thousands commas', () => {
    expect(money(980_000)).toBe('$9,800');
    expect(money(124_850_000)).toBe('$1,248,500');
    expect(count(1248)).toBe('1,248');
  });
});

describe('yearDone', () => {
  it('is day of year over days in year', () => {
    expect(yearDone('2026-11-10')).toBeCloseTo(314 / 365);
    expect(Math.round(yearDone('2026-11-10') * 100)).toBe(86);
    expect(yearDone('2026-12-31')).toBe(1);
    expect(yearDone('2024-01-01')).toBeCloseTo(1 / 366);
  });
});

describe('goalRow', () => {
  it('maps the money goal as the gold lead, turning met once raised passes the target', () => {
    const g = goalRow({ id: 'g1', title: 'Raise $15,000', metric: 'money_raised', status: 'on_track', target_cents: 1_500_000 }, FACTS, TODAY);
    expect(g).toMatchObject({ icon: 'money', lead: true, kind: 'money', have: 980_000, of: 1_500_000, unit: 'raised', status: 'on_track' });
    const met = goalRow({ id: 'g1', title: 'x', metric: 'money_raised', status: 'on_track', target_cents: 500_000 }, FACTS, TODAY);
    expect(met.status).toBe('met');
  });
  it('counts spending against the year budget when the goal has no target', () => {
    const g = goalRow({ id: 'g2', title: 'Spend', metric: 'budget_spent', status: 'in_progress' }, FACTS, TODAY);
    expect(g).toMatchObject({ icon: 'money', lead: false, kind: 'money', have: 300_000, of: 1_000_000, unit: 'spent' });
  });
  it('draws checklists as steps', () => {
    const g = goalRow({ id: 'g3', title: 'Cert', metric: 'checklist', status: 'in_planning', checklist_id: 'cl1' }, FACTS, TODAY);
    expect(g).toMatchObject({ icon: 'flag', kind: 'steps', have: 1, of: 5, unit: 'steps done' });
  });
  it('draws scoring as marks with the award note, using the current cycle when none is named', () => {
    const g = goalRow({ id: 'g4', title: 'Award', metric: 'applicants_scored', status: 'in_progress' }, FACTS, TODAY);
    expect(g).toMatchObject({ icon: 'cap', kind: 'marks', have: 3, of: 18, unit: 'applicants scored', note: 'Award Mon Nov 30 · in 20 days' });
  });
  it('draws a typed-in goal as marks', () => {
    const g = goalRow({ id: 'g5', title: 'Posts', metric: 'manual', status: 'in_progress', manual_value: 4, target_count: 12 }, FACTS, TODAY);
    expect(g).toMatchObject({ icon: 'goals', kind: 'marks', have: 4, of: 12, unit: 'done' });
  });
});

describe('awardNote', () => {
  it('counts days to the award, then drops the count', () => {
    expect(awardNote(TODAY, '2026-11-30')).toBe('Award Mon Nov 30 · in 20 days');
    expect(awardNote(TODAY, '2026-11-11')).toBe('Award Wed Nov 11 · in 1 day');
    expect(awardNote(TODAY, '2026-11-10')).toBe('Award Tue Nov 10');
    expect(awardNote(TODAY, '2026-11-01')).toBe('Award Sun Nov 1');
    expect(awardNote(TODAY, null)).toBeNull();
  });
});

describe('cycleRows and cyclesTotal', () => {
  const cycles = [
    { id: 'c1', term: 'Fall', year: 2025, status: 'archived', decision_date: '2025-11-30' },
    { id: 'c9', term: 'Fall 2026', year: 2026, status: 'published', decision_date: '2026-11-30' },
  ];
  const awards = [{ past_term: 'Spring 2021' }, { past_term: 'Spring 2021' }, { cycle_id: 'c1' }, { past_term: 'Fall 2021' }, {}];
  it('groups awards per cycle oldest first and ends with the cycle being decided', () => {
    expect(cycleRows(awards, cycles, 2026)).toEqual([
      { label: 'Spring 2021', count: 2, note: null },
      { label: 'Fall 2021', count: 1, note: null },
      { label: 'Fall 2025', count: 1, note: null },
      { label: 'Fall 2026', count: null, note: 'Decided Mon Nov 30' },
    ]);
  });
  it('totals the counted cycles from the first year', () => {
    expect(cyclesTotal(cycleRows(awards, cycles, 2026))).toBe('4 since 2021');
    expect(cyclesTotal([])).toBe('');
    expect(cyclesTotal([{ label: 'Fall 2026', count: null, note: null }])).toBe('');
  });
  it('has no rows with no awards and no open cycle', () => {
    expect(cycleRows([], [], 2026)).toEqual([]);
  });
});

describe('figure keys and figures', () => {
  it('round-trips a cell key', () => {
    expect(figureKey('money_raised_cents', 2025)).toBe('money_raised_cents:2025');
    expect(parseKey('money_raised_cents:2025')).toEqual({ metric: 'money_raised_cents', year: 2025 });
    expect(parseKey('applicants:2023')).toEqual({ metric: 'applicants', year: 2023 });
  });
  it('keeps only the two metrics in the listed years', () => {
    const rows = [
      { year: 2023, metric: 'applicants', value: 96 },
      { year: 2020, metric: 'applicants', value: 50 },
      { year: 2024, metric: 'other', value: 1 },
      { year: '2025', metric: 'money_raised_cents', value: '1200' },
    ];
    expect(mapFigures(rows, [2023, 2024, 2025])).toEqual([
      { year: 2023, metric: 'applicants', value: 96 },
      { year: 2025, metric: 'money_raised_cents', value: 1200 },
    ]);
  });
  it('opens money raised for the latest year without one', () => {
    expect(firstOpenFigure([2023, 2024, 2025], [])).toBe('money_raised_cents:2025');
    expect(firstOpenFigure([2023, 2024, 2025], [{ year: 2025, metric: 'money_raised_cents', value: 1 }])).toBe('money_raised_cents:2024');
    const all = [2023, 2024, 2025].map((year) => ({ year, metric: 'money_raised_cents' as const, value: 1 }));
    expect(firstOpenFigure([2023, 2024, 2025], all)).toBeNull();
  });
});

describe('parseFigure', () => {
  it('reads dollars as cents', () => {
    expect(parseFigure('money_raised_cents', '12,400')).toEqual({ ok: true, value: 1_240_000 });
    expect(parseFigure('money_raised_cents', '$12,400.50')).toEqual({ ok: true, value: 1_240_050 });
    expect(parseFigure('money_raised_cents', '')).toEqual({ ok: false, error: 'Enter an amount in dollars, like 12,400.' });
    expect(parseFigure('money_raised_cents', 'abc').ok).toBe(false);
    expect(parseFigure('money_raised_cents', '-5').ok).toBe(false);
    expect(parseFigure('money_raised_cents', '12400.5')).toEqual({ ok: true, value: 1_240_050 });
    expect(parseFigure('money_raised_cents', '0.07')).toEqual({ ok: true, value: 7 });
    expect(parseFigure('money_raised_cents', ' 18 ')).toEqual({ ok: true, value: 1800 });
    expect(parseFigure('money_raised_cents', '$12400')).toEqual({ ok: true, value: 1_240_000 });
    expect(parseFigure('money_raised_cents', '$12400.5')).toEqual({ ok: true, value: 1_240_050 });
    expect(parseFigure('money_raised_cents', '$100000000.01').ok).toBe(false);
  });
  it.each(['0x10', '1e5', '1E5', '0b101', '0o17', '1,2,3', '12,40', '1,2345', '12.345', '12.', '.5', '$-5', 'Infinity', 'NaN', '12 400', '$$12', '1_000'])(
    'refuses money typed as %j with the demo error',
    (t) => expect(parseFigure('money_raised_cents', t)).toEqual({ ok: false, error: 'Enter an amount in dollars, like 12,400.' }),
  );
  it('caps money at $100,000,000', () => {
    expect(parseFigure('money_raised_cents', '100,000,000')).toEqual({ ok: true, value: MAX_MONEY_DOLLARS * 100 });
    expect(parseFigure('money_raised_cents', '100000000.01').ok).toBe(false);
    expect(parseFigure('money_raised_cents', '100,000,001').ok).toBe(false);
  });
  it('reads applicants as a whole number', () => {
    expect(parseFigure('applicants', '18')).toEqual({ ok: true, value: 18 });
    expect(parseFigure('applicants', '1,248')).toEqual({ ok: true, value: 1248 });
    expect(parseFigure('applicants', '0')).toEqual({ ok: true, value: 0 });
    expect(parseFigure('applicants', '18.5')).toEqual({ ok: false, error: 'Enter a whole number, like 18.' });
    expect(parseFigure('applicants', ' ').ok).toBe(false);
  });
  it.each(['0x10', '1e3', '0b101', '1,2,3', '12,48', '-4', '+4', '4.0', '$4', 'Infinity', ',12'])('refuses applicants typed as %j', (t) =>
    expect(parseFigure('applicants', t)).toEqual({ ok: false, error: 'Enter a whole number, like 18.' }),
  );
  it('caps applicants at 1,000,000', () => {
    expect(parseFigure('applicants', '1,000,000')).toEqual({ ok: true, value: MAX_APPLICANTS });
    expect(parseFigure('applicants', '1000001').ok).toBe(false);
  });
});

describe('moneyUp', () => {
  it('rounds "to go" amounts up to the next dollar', () => {
    expect(moneyUp(40)).toBe('$1');
    expect(moneyUp(520_000)).toBe('$5,200');
    expect(moneyUp(520_001)).toBe('$5,201');
    expect(moneyUp(0)).toBe('$0');
  });
});

describe('pageAll', () => {
  // A table of n rows served in pages (at most `cap` per request, like the API's max rows), recording each page asked for.
  const table = (n: number, cap = Infinity) => {
    const asked: [number, number][] = [];
    const fetch = async (from: number, to: number) => {
      asked.push([from, to]);
      const end = Math.min(n, to + 1, from + cap);
      return Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i);
    };
    return { asked, fetch };
  };
  it('reads every page and stops only on an empty one', async () => {
    const t = table(2500);
    const rows = await pageAll(t.fetch);
    expect(rows).toHaveLength(2500);
    expect(t.asked).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
  });
  it('skips no row when the API caps a page below the asked size', async () => {
    const t = table(1234, 500);
    const rows = await pageAll(t.fetch);
    expect(rows).toEqual(Array.from({ length: 1234 }, (_, i) => i));
    expect(t.asked.map(([from]) => from)).toEqual([0, 500, 1000, 1234]);
  });
  it('reads exactly the limit, then fails only when rows remain past it', async () => {
    expect(await pageAll(table(3000).fetch, 1000, 3000)).toHaveLength(3000);
    await expect(pageAll(table(3001).fetch, 1000, 3000)).rejects.toThrow();
    await expect(pageAll(table(10_000).fetch, 1000, 3000)).rejects.toThrow();
  });
  it('passes a failed page on', async () => {
    await expect(pageAll(async () => Promise.reject(new Error('net')))).rejects.toThrow('net');
  });
});

describe('uncounted goals', () => {
  it('marks steps and scoring goals uncounted when their read failed, never the money goals', () => {
    const miss = { steps: true, scores: true };
    expect(goalRow({ id: 'g3', metric: 'checklist', status: 'in_planning', checklist_id: 'cl1' }, FACTS, TODAY, miss).uncounted).toBe(true);
    expect(goalRow({ id: 'g4', metric: 'applicants_scored', status: 'in_progress' }, FACTS, TODAY, miss).uncounted).toBe(true);
    expect(goalRow({ id: 'g1', metric: 'money_raised', status: 'on_track', target_cents: 1 }, FACTS, TODAY, miss).uncounted).toBeUndefined();
    expect(goalRow({ id: 'g3', metric: 'checklist', status: 'in_planning', checklist_id: 'cl1' }, FACTS, TODAY).uncounted).toBeUndefined();
  });
});

describe('goalsNews', () => {
  const lead: GoalRow = { id: 'g1', title: 'Raise $15,000', status: 'on_track', icon: 'money', lead: true, kind: 'money', have: 980_000, of: 1_500_000, unit: 'raised', note: null };
  it('gives the money still to raise until the lead goal is met', () => {
    expect(goalsNews([lead])).toEqual({ left: 520_000, title: 'Raise $15,000' });
    expect(goalsNews([{ ...lead, have: 1_500_000 }])).toBeNull();
    expect(goalsNews([{ ...lead, of: 0 }])).toBeNull();
    expect(goalsNews([])).toBeNull();
  });
});

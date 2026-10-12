import { describe, expect, it } from 'vitest';
import { cycleBars, goalCard, yoyYears, type GoalFacts } from '@/lib/daily-goals';

const facts: GoalFacts = {
  year: 2026,
  raisedCents: 980_000,
  spentCents: 367_000,
  budgetCents: 850_000,
  checklistSteps: { cl: { done: 1, total: 5 } },
  cycleScores: { cy: { scored: 10, applications: 18, decisionDate: '2026-10-23' } },
  currentCycleId: 'cy',
};

describe('goalCard', () => {
  it('counts money raised against the target', () => {
    const c = goalCard({ id: 'g', title: 'Raise $15,000', metric: 'money_raised', status: 'in_progress', target_cents: 1_500_000 }, facts);
    expect(c).toMatchObject({ value: '$9,800', status: 'in_progress', foot: '65% of the goal. $5,200 to go.' });
    expect(c.frac).toBeCloseTo(0.653, 2);
  });
  it('turns met and says how far over when the goal is passed', () => {
    const c = goalCard({ id: 'g', title: 't', metric: 'money_raised', status: 'in_progress', target_cents: 800_000 }, facts);
    expect(c.status).toBe('met');
    expect(c.frac).toBe(1);
    expect(c.foot).toBe('123%, goal passed. $1,800 over.');
  });
  it('handles a goal with no target', () => {
    expect(goalCard({ id: 'g', title: 't', metric: 'money_raised', status: 'in_planning' }, facts).foot).toBe('No target set.');
  });
  it('counts spending against the year budget (or its own target)', () => {
    expect(goalCard({ id: 'g', title: 't', metric: 'budget_spent', status: 'on_track' }, facts)).toMatchObject({ value: '$3,670', unit: 'spent', foot: 'of $8,500 for 2026.' });
    expect(goalCard({ id: 'g', title: 't', metric: 'budget_spent', status: 'on_track', target_cents: 1_000_000 }, facts).foot).toBe('of $10,000 for 2026.');
  });
  it('counts checklist steps', () => {
    const c = goalCard({ id: 'g', title: 't', metric: 'checklist', status: 'in_planning', checklist_id: 'cl' }, facts);
    expect(c).toMatchObject({ value: '1 of 5', unit: 'steps', foot: '4 steps to go.', frac: 0.2 });
    expect(goalCard({ id: 'g', title: 't', metric: 'checklist', status: 'in_planning', checklist_id: 'none' }, facts).foot).toBe('No steps yet.');
  });
  it('shows N of M scored with the same wording on laptop and phone (O7)', () => {
    const c = goalCard({ id: 'g', title: 't', metric: 'applicants_scored', status: 'on_track' }, facts);
    expect(c).toMatchObject({ value: '10 of 18', unit: 'scored', foot: 'Award by Fri Oct 23.' });
    expect(c.phoneValue).toBeUndefined();
    expect(c.phoneFoot).toBe(c.foot);
  });
  it('reads a manual goal from its value and target', () => {
    expect(goalCard({ id: 'g', title: 't', metric: 'manual', status: 'in_progress', manual_value: 3, target_count: 12 }, facts)).toMatchObject({ value: '3 of 12', frac: 0.25 });
  });
});

describe('cycleBars', () => {
  const cycles = [
    { id: 'c1', term: 'Fall', year: 2025, status: 'archived', decision_date: null },
    { id: 'c2', term: 'Fall 2026', year: 2026, status: 'published', decision_date: '2026-10-23' },
  ];
  it('groups awards per cycle or past term, oldest first, with a dashed bar for the cycle being decided', () => {
    const awards = [
      { past_term: 'Spring 2024' },
      { past_term: 'Spring 2024' },
      { past_term: 'Fall 2024' },
      { cycle_id: 'c1' },
    ];
    const bars = cycleBars(awards, cycles);
    expect(bars.map((b) => [b.label, b.sub, b.count])).toEqual([
      ['Spring', '2024', 2],
      ['Fall', '2024', 1],
      ['Fall', '2025', 1],
      ['Fall 2026', 'Oct 23', null],
    ]);
    expect(bars[0].phoneLabel).toBe('Sp');
    expect(bars[0].phoneSub).toBe('24');
  });
  it('has no dashed bar once the open cycle has awards', () => {
    expect(cycleBars([{ cycle_id: 'c2' }], cycles).map((b) => b.count)).toEqual([1]);
  });
});

it('yoyYears are the three years before this one', () => {
  expect(yoyYears(2026)).toEqual([2023, 2024, 2025]);
});

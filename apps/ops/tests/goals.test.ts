import { describe, expect, it } from 'vitest';
import { awardBars, goalCard, type GoalFacts, type GoalRow } from '@/lib/goals-build';

const facts: GoalFacts = {
  raisedCents: 980_000,
  spentCents: 367_049,
  budgetCents: 900_000,
  checklists: { c1: { done: 1, total: 5 } },
  cycles: { cy: { scored: 10, total: 18, decision: '2026-10-23' }, open: { scored: 2, total: 5, decision: null } },
};
const goal = (p: Partial<GoalRow>): GoalRow => ({ id: 'g', title: 'Goal', metric: 'manual', status: 'in_progress', target_cents: null, target_count: null, checklist_id: null, cycle_id: null, manual_value: null, ...p });

describe('goalCard', () => {
  it('counts money raised against the target', () => {
    const c = goalCard(goal({ metric: 'money_raised', target_cents: 1_500_000 }), facts);
    expect(c.value).toBe('$9,800');
    expect(c.frac).toBeCloseTo(0.653, 2);
    expect(c.foot).toBe('65% of the goal. $5,200 to go.');
    expect(c.phoneUnit).toBe('raised');
  });
  it('says when the money goal is passed', () => {
    const c = goalCard(goal({ metric: 'money_raised', target_cents: 900_000 }), facts);
    expect(c.foot).toBe('109%, goal passed. $800 over.');
  });
  it('counts budget spent in whole dollars, falling back to the year budget', () => {
    expect(goalCard(goal({ metric: 'budget_spent', target_cents: 850_000 }), facts)).toMatchObject({ value: '$3,670', unit: 'spent', foot: 'of $8,500 budgeted.' });
    expect(goalCard(goal({ metric: 'budget_spent' }), facts).foot).toBe('of $9,000 budgeted.');
  });
  it('counts checklist steps', () => {
    expect(goalCard(goal({ metric: 'checklist', checklist_id: 'c1' }), facts)).toMatchObject({ value: '1 of 5', unit: 'steps', foot: '4 steps to go.' });
    expect(goalCard(goal({ metric: 'checklist', checklist_id: 'none' }), facts).value).toBe('0 of 0');
  });
  it('counts applicants scored, the same measure on the phone (O7)', () => {
    const c = goalCard(goal({ metric: 'applicants_scored', cycle_id: 'cy' }), facts);
    expect(c).toMatchObject({ value: '10 of 18', unit: 'scored', foot: 'Award by Fri Oct 23.' });
    expect(c.phoneValue).toBeUndefined();
    expect(c.phoneFoot).toBe(c.foot);
    expect(goalCard(goal({ metric: 'applicants_scored', cycle_id: 'open' }), facts).foot).toBe('3 left to score.');
  });
  it('shows a manual value against a count target', () => {
    expect(goalCard(goal({ manual_value: 3, target_count: 4 }), facts)).toMatchObject({ value: '3 of 4', foot: '1 to go.' });
  });
});

describe('awardBars', () => {
  const cycles = [
    { id: 'c25', term: 'Fall', year: 2025, opens_at: '2025-08-20T00:00:00Z', decision_date: '2025-10-20', status: 'closed' },
    { id: 'c26', term: 'Fall', year: 2026, opens_at: '2026-08-20T00:00:00Z', decision_date: '2026-10-23', status: 'published' },
    { id: 'draft', term: 'Spring', year: 2027, opens_at: null, decision_date: null, status: 'draft' },
  ];
  it('counts past awards by term and current ones by cycle, oldest first, then the cycle being decided', () => {
    const bars = awardBars(
      [
        { kind: 'past', cycle_id: null, past_term: 'Spring 2025', past_term_starts: '2025-01-15' },
        { kind: 'main', cycle_id: 'c25', past_term: null, past_term_starts: null },
        { kind: 'extra', cycle_id: 'c25', past_term: null, past_term_starts: null },
        { kind: 'past', cycle_id: null, past_term: 'Spring 2024', past_term_starts: '2024-01-15' },
        { kind: 'past', cycle_id: null, past_term: 'Spring 2024', past_term_starts: '2024-01-15' },
      ],
      cycles,
    );
    expect(bars.map((b) => [b.label, b.sub, b.count])).toEqual([
      ['Spring', '2024', 2],
      ['Spring', '2025', 1],
      ['Fall', '2025', 2],
      ['Fall 2026', 'Oct 23', null],
    ]);
    expect(bars[0]).toMatchObject({ phoneLabel: 'Sp', phoneSub: '24' });
  });
  it('is empty with no awards and no open cycle', () => {
    expect(awardBars([], [])).toEqual([]);
  });
});

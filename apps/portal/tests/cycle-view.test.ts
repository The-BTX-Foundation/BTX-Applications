import { describe, expect, it, vi } from 'vitest';

vi.mock('@btx/data/server', () => ({ createAnonClient: () => null }));
vi.mock('@btx/data', () => ({ cycleVariant: () => 'open', fetchPublishedCycle: async () => ({}), getPublishedCycle: async () => null, getAuthMode: () => 'mock' }));

const { toView, drawingProps, DECISION_TO_COME } = await import('@/lib/cycle');

// The Legacy cycle as entered on 2026-10-12: no decision date yet.
const legacy = {
  id: 'x', term: 'Fall 2026', year: 2026, status: 'draft', award_name: 'Legacy Scholarship', award_amount_cents: 250000,
  opens_at: '2026-10-12T16:00:00Z', closes_at: '2026-11-07T04:59:00Z', interview_start: '2026-11-10', interview_end: '2026-11-20',
  decision_date: null, next_cycle_month: null, essay_prompt: null, essay_use: null, requirements: [], photo_due: null,
  payment_note: null, event_enabled: false, event_at: null, code_lifetime_minutes: 60, created_at: '', updated_at: '',
} as unknown as Parameters<typeof toView>[0];

describe('cycle view without a decision date', () => {
  it('still draws the dates, with the decision labelled "Date to come"', () => {
    const v = toView(legacy);
    expect(v.drawing).not.toBeNull();
    expect(v.drawing?.decisionKnown).toBe(false);
    expect(v.drawing?.decision).toBe('2026-12-04');
    const p = drawingProps(v, 'open');
    expect(p.dates.decision).toBe(DECISION_TO_COME);
    expect(p.dates.interview).toBe('Nov 10 to Nov 20');
    expect(p.applyLabel).toBe('Apply by Nov 6');
  });
  it('shows the amount and closes Nov 6 at 11:59 PM Eastern (standard time)', () => {
    const v = toView(legacy);
    expect(v.amount).toBe('$2,500');
    expect(v.applyByLong).toContain('Nov 6');
    expect(v.deadlineTime).toBe('11:59 PM');
  });
});

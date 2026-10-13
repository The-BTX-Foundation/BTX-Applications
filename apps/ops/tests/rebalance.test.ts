import { describe, expect, it } from 'vitest';
import { planRebalance, rebalanceTargets, type RebalanceInterview, type RebalancePerson } from '@/lib/rebalance';

const NOW = new Date('2026-10-10T12:00:00Z');
const person = (userId: string, maxInterviews: number | null = null): RebalancePerson => ({ userId, name: userId.toUpperCase(), maxInterviews });
// An interview `days` days after NOW at 14:00Z, 30 minutes long.
const iv = (slotId: string, days: number, a: string, b: string, candidates: string[], minutes = 0): RebalanceInterview => {
  const start = Date.parse('2026-10-10T14:00:00Z') + days * 86_400_000 + minutes * 60_000;
  return { slotId, startsAt: new Date(start).toISOString(), endsAt: new Date(start + 30 * 60_000).toISOString(), a, b, candidates };
};

describe('rebalanceTargets', () => {
  it('shares the seats evenly, floor or ceiling, ceilings to people who hold more', () => {
    expect(rebalanceTargets([person('a'), person('b'), person('c')], 8, { b: 5 })).toEqual({ b: 3, a: 3, c: 2 });
  });
  it('caps people at their limit and shares the rest among the others', () => {
    expect(rebalanceTargets([person('a', 1), person('b'), person('c')], 9)).toEqual({ a: 1, b: 4, c: 4 });
    // Everyone capped: the targets add up to less than the seats.
    expect(rebalanceTargets([person('a', 1), person('b', 2)], 10)).toEqual({ a: 1, b: 2 });
  });
  it('a limit above the share changes nothing', () => {
    expect(rebalanceTargets([person('a', 10), person('b')], 4)).toEqual({ a: 2, b: 2 });
  });
});

describe('planRebalance', () => {
  const people = [person('a'), person('b'), person('c'), person('d')];

  it('moves interviews from people over the target to eligible people under it', () => {
    const interviews = [iv('s1', 3, 'a', 'b', ['c', 'd']), iv('s2', 4, 'a', 'b', ['c', 'd']), iv('s3', 5, 'a', 'c', ['d'])];
    const out = planRebalance({ people, interviews, now: NOW });
    // 6 seats over 4 people: 2, 2, 1, 1 (ceilings to a and b, who hold more). a holds 3.
    expect(out.targets).toEqual({ a: 2, b: 2, c: 1, d: 1 });
    expect(out.before).toEqual({ a: 3, b: 2, c: 1, d: 0 });
    expect(out.moves).toEqual([{ slotId: 's3', from: 'a', to: 'd' }]);
    expect(out.after).toEqual({ a: 2, b: 2, c: 1, d: 1 });
  });

  it('never moves an interview within 48 hours', () => {
    const interviews = [iv('soon', 1, 'a', 'b', ['c']), iv('soon2', 1.9, 'a', 'b', ['c'])];
    const out = planRebalance({ people: [person('a'), person('b'), person('c')], interviews, now: NOW });
    expect(out.moves).toEqual([]);
  });

  it("only moves to someone on the interview's candidate list, and keeps two different people", () => {
    const interviews = [iv('s1', 3, 'a', 'b', ['b']), iv('s2', 4, 'a', 'b', [])];
    const out = planRebalance({ people: [person('a'), person('b'), person('c')], interviews, now: NOW });
    expect(out.moves).toEqual([]);
  });

  it('does not put someone into two overlapping interviews in one plan', () => {
    // Targets 2, 2, 2: a and b each hold one too many, and d could take s1 or s2, but not both (they overlap).
    const interviews = [iv('s1', 3, 'a', 'b', ['d']), iv('s2', 3, 'a', 'b', ['d'], 15), iv('s3', 4, 'a', 'b', [])];
    const out = planRebalance({ people: [person('a'), person('b'), person('d')], interviews, now: NOW });
    expect(out.targets).toEqual({ a: 2, b: 2, d: 2 });
    expect(out.moves).toEqual([{ slotId: 's2', from: 'a', to: 'd' }]);
  });

  it('leaves people who did not send availability alone', () => {
    const interviews = [iv('s1', 3, 'x', 'a', ['b']), iv('s2', 4, 'x', 'a', ['b'])];
    const out = planRebalance({ people: [person('a'), person('b')], interviews, now: NOW });
    expect(out.moves).toEqual([{ slotId: 's2', from: 'a', to: 'b' }]);
    expect(out.after.x).toBe(2);
  });
});

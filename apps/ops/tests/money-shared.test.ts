import { describe, expect, it } from 'vitest';
import { giftStats, parseCents, pct, quarterRange, shortCategory, spentInQuarter, totals, usd, type BudgetCategory, type GiftFact } from '@/lib/money-shared';

const cat = (id: string, budget: number, spent: number, plan: number): BudgetCategory => ({ id, name: id, phone: id, short: id, budget_cents: budget, spent_cents: spent, q4_plan_cents: plan });

describe('budget helpers', () => {
  it('adds up the categories', () => {
    expect(totals([cat('a', 250_000, 0, 250_000), cat('b', 300_000, 275_000, 25_000)])).toEqual({ budget: 550_000, spent: 275_000, plan: 275_000 });
    expect(totals([])).toEqual({ budget: 0, spent: 0, plan: 0 });
  });
  it('knows each quarter', () => {
    expect(quarterRange(2026, 1)).toEqual(['2026-01-01', '2026-03-31']);
    expect(quarterRange(2026, 3)).toEqual(['2026-07-01', '2026-09-30']);
    expect(quarterRange(2024, 1)[1]).toBe('2024-03-31');
    expect(quarterRange(2026, 4)).toEqual(['2026-10-01', '2026-12-31']);
  });
  it('sums spending inside a quarter only', () => {
    const rows = [
      { spent_on: '2026-06-30', amount_cents: 1 },
      { spent_on: '2026-07-01', amount_cents: 10 },
      { spent_on: '2026-09-30', amount_cents: 100 },
      { spent_on: '2026-10-01', amount_cents: 1000 },
    ];
    expect(spentInQuarter(rows, 2026, 3)).toBe(110);
  });
  it('shortens a category name', () => {
    expect(shortCategory('Sponsorships (NSBE convention)')).toBe('Sponsorships');
    expect(shortCategory('Scholarships')).toBe('Scholarships');
  });
  it('formats and parses money', () => {
    expect(usd(250_000)).toBe('$2,500');
    expect(usd(1250)).toBe('$12.50');
    expect(parseCents('$1,200')).toBe(120_000);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('0')).toBeNull();
    expect(pct(1, 0)).toBe(0);
  });
});

describe('giftStats', () => {
  const g = (gift_on: string, amount_cents: number, donor_id: string | null, source: GiftFact['source'] = 'individual', monthly = false): GiftFact => ({ gift_on, amount_cents, donor_id, source, monthly });
  const gifts = [
    g('2025-11-02', 5000, 'tanya'),
    g('2026-03-11', 10000, 'tanya'),
    g('2026-08-05', 200000, 'harbor', 'corporate'),
    g('2026-09-20', 25000, 'marcus', 'individual', true),
    g('2026-10-01', 25000, 'marcus', 'individual', true),
    g('2026-09-26', 40000, null, 'event'),
  ];
  it('counts the year', () => {
    const s = giftStats(gifts, 2026);
    expect(s.raised_cents).toBe(300000);
    expect(s.q3_cents).toBe(265000);
    expect(s.donors).toBe(3); // anonymous gifts are money, not donors
    expect(s.avg_gift_cents).toBe(60000);
    expect(s.new_donors).toBe(2); // tanya gave in 2025
    expect(s.monthly_donors).toBe(1);
    expect(s.sources.map((x) => [x.key, x.cents])).toEqual([
      ['individual', 60000],
      ['corporate', 200000],
      ['event', 40000],
      ['grant', 0],
    ]);
  });
  it('is all zero with no gifts', () => {
    const s = giftStats([], 2026);
    expect(s).toMatchObject({ raised_cents: 0, q3_cents: 0, donors: 0, avg_gift_cents: 0, new_donors: 0, monthly_donors: 0 });
  });
});

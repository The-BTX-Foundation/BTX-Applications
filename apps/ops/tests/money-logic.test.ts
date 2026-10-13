import { describe, expect, it } from 'vitest';
import { giftStats, initialsOf, quarterSpent } from '@/lib/money-logic';

const g = (gift_on: string, amount_cents: number, source: string, donor_id: string | null, monthly = false) => ({ gift_on, amount_cents, source, donor_id, monthly });

describe('giftStats', () => {
  const gifts = [
    g('2026-09-20', 25000, 'individual', 'a', true),
    g('2026-08-05', 200000, 'corporate', 'b'),
    g('2026-03-11', 10000, 'individual', 'c'),
    g('2025-11-02', 5000, 'individual', 'c'),
    g('2026-05-01', 3000, 'event', null),
  ];
  const s = giftStats(gifts, '2026');
  it('adds up the year and leaves earlier years out', () => {
    expect(s.raised_cents).toBe(238000);
    expect(s.q3_cents).toBe(225000);
  });
  it('counts named donors only, new ones, and monthly ones', () => {
    expect(s.donors).toBe(3);
    expect(s.new_donors).toBe(2); // c gave in 2025, so is not new
    expect(s.monthly_donors).toBe(1);
  });
  it('rounds the average to whole dollars', () => {
    expect(s.avg_gift_cents).toBe(Math.round(238000 / 4 / 100) * 100);
  });
  it('splits by source', () => {
    expect(s.sources.find((x) => x.key === 'individual')?.cents).toBe(35000);
    expect(s.sources.find((x) => x.key === 'grant')?.cents).toBe(0);
  });
  it('handles no gifts', () => {
    expect(giftStats([], '2026')).toMatchObject({ raised_cents: 0, donors: 0, avg_gift_cents: 0 });
  });
});

describe('quarterSpent', () => {
  const rows = [
    { spent_on: '2026-06-30', amount_cents: 100 },
    { spent_on: '2026-07-01', amount_cents: 200 },
    { spent_on: '2026-09-30', amount_cents: 300 },
    { spent_on: '2026-10-01', amount_cents: 400 },
    { spent_on: '2025-08-01', amount_cents: 500 },
  ];
  it('sums one quarter of one year', () => {
    expect(quarterSpent(rows, 2026, 3)).toBe(500);
    expect(quarterSpent(rows, 2026, 4)).toBe(400);
    expect(quarterSpent(rows, 2026, 2)).toBe(100);
  });
  it('quarter 4 stops at the year end', () => {
    expect(quarterSpent([{ spent_on: '2027-01-01', amount_cents: 9 }, { spent_on: '2026-12-31', amount_cents: 1 }], 2026, 4)).toBe(1);
  });
});

describe('initialsOf', () => {
  it('takes first and last word', () => expect(initialsOf('Ada Byron Lovelace')).toBe('AL'));
  it('uses two letters of a single name', () => expect(initialsOf('madonna')).toBe('MA'));
  it('keeps only letters A to Z', () => {
    expect(initialsOf('[B2] Zoe Test')).toBe('BT');
    expect(initialsOf('123')).toBe('X');
    expect(initialsOf('')).toBe('X');
  });
});

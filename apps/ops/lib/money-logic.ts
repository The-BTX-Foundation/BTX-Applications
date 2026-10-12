// Pure helpers for the Money and People loaders (no database, no next/headers), so they can be unit tested.
import { GIFT_SOURCES, type GiftSource } from './money-shared';

type GiftLike = Record<string, unknown>;

export type GiftStats = {
  raised_cents: number;
  q3_cents: number;
  donors: number;
  avg_gift_cents: number;
  new_donors: number;
  monthly_donors: number;
  sources: { key: GiftSource; label: string; cents: number }[];
};

// Fundraising numbers for one calendar year, counted from gift rows. A donor is "new" when none of their gifts is dated
// before the year; a donor is monthly when one of this year's gifts is marked monthly; an anonymous gift counts toward
// the total and the average but not toward the donor counts.
export function giftStats(gifts: GiftLike[], year: string): GiftStats {
  const inYear = gifts.filter((g) => String(g.gift_on).startsWith(year));
  const sum = (rows: GiftLike[]) => rows.reduce((t, g) => t + Number(g.amount_cents), 0);
  const raised = sum(inYear);
  const donorIds = new Set(inYear.map((g) => g.donor_id).filter(Boolean));
  const earlier = new Set(gifts.filter((g) => String(g.gift_on) < year).map((g) => g.donor_id));
  const monthly = new Set(inYear.filter((g) => g.monthly).map((g) => g.donor_id).filter(Boolean));
  return {
    raised_cents: raised,
    q3_cents: sum(inYear.filter((g) => String(g.gift_on) >= `${year}-07-01` && String(g.gift_on) <= `${year}-09-30`)),
    donors: donorIds.size,
    // The page says "about $360", so the average is rounded to whole dollars.
    avg_gift_cents: inYear.length ? Math.round(raised / inYear.length / 100) * 100 : 0,
    new_donors: [...donorIds].filter((d) => !earlier.has(d)).length,
    monthly_donors: monthly.size,
    sources: GIFT_SOURCES.map((s) => ({ key: s.key, label: s.label, cents: sum(inYear.filter((g) => g.source === s.key)) })),
  };
}

// What was spent in a quarter (1 to 4) of a year, from spending rows with a date (YYYY-MM-DD) and an amount.
export function quarterSpent(rows: Record<string, unknown>[], year: number, quarter: number): number {
  const first = (quarter - 1) * 3 + 1;
  const from = `${year}-${String(first).padStart(2, '0')}-01`;
  const next = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(first + 3).padStart(2, '0')}-01`;
  return rows.filter((r) => String(r.spent_on) >= from && String(r.spent_on) < next).reduce((t, r) => t + Number(r.amount_cents), 0);
}

// "Ada Lovelace" -> "AL"; one word -> its first two letters; capital letters A to Z only (the database's initials rule),
// at most two; "X" when the name has no letters.
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  if (words.length === 0) return 'X';
  const raw = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return raw.toUpperCase();
}

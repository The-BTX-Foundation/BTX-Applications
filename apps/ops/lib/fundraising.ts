// Money > Fundraising: the data. Types mirror the Ops Hub schema (gifts, donors, goals, checklists + tasks).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: gifts, the year's "money raised" goal and the
// "Year-end giving" checklist are read as the signed-in person (tested against the local stack, 2026-10-12); the sums are
// giftStats() in money-shared.ts. No goal or no checklist yet: goal_cents / checklist are null and the page says so.
import { hasSupabaseEnv } from '@btx/data';
import { FUNDRAISING_MOCK, FUNDRAISING_STRESS } from '@/mock/money';
import { checklistByTitle, read } from './money-db';
import { giftStats, type FundraisingData, type GiftRow, type GiftSource } from './money-shared';

const FAILED: FundraisingData = { ...FUNDRAISING_MOCK, failed: true, mode: 'mock' };

// Loads the Fundraising page's data. `demo` is "error" (failed shape) or "stress" (the stress sample).
export async function loadFundraising({ demo }: { demo?: string } = {}): Promise<FundraisingData> {
  if (demo === 'error') return FAILED;
  const mock: FundraisingData = { ...(demo === 'stress' ? FUNDRAISING_STRESS : FUNDRAISING_MOCK), failed: false, mode: 'mock' };
  if (!hasSupabaseEnv()) return mock;
  try {
    const year = new Date().getFullYear();
    const [gifts, goals, checklist] = await Promise.all([
      read('gifts', 'id, gift_on, amount_cents, source, monthly, donor_id, created_at, donors(name)', { order: ['gift_on', false] }),
      read('goals', 'target_cents, position', { eq: { year, metric: 'money_raised' }, order: ['position', true], limit: 1 }),
      checklistByTitle('Year-end giving'),
    ]);
    const stats = giftStats(
      gifts.map((g) => ({ gift_on: String(g.gift_on), amount_cents: Number(g.amount_cents), source: g.source as GiftSource, monthly: Boolean(g.monthly), donor_id: g.donor_id ? String(g.donor_id) : null })),
      year,
    );
    const recent = [...gifts].sort((a, b) => String(b.gift_on).localeCompare(String(a.gift_on)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const goal = goals[0]?.target_cents;
    return {
      failed: false,
      mode: 'live',
      goal_cents: goal == null ? null : Number(goal),
      ...stats,
      recent: recent.map(
        (g): GiftRow => ({ id: String(g.id), gift_on: String(g.gift_on), donor: String((g.donors as { name?: string } | null)?.name ?? 'Anonymous'), source: g.source as GiftSource, amount_cents: Number(g.amount_cents) }),
      ),
      checklist,
    };
  } catch {
    return FAILED;
  }
}

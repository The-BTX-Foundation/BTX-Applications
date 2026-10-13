// Money > Fundraising: the data (gifts, donors, goals, checklists + tasks).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: reads the Ops Hub tables.
import { hasSupabaseEnv } from '@btx/data';
import { FUNDRAISING_MOCK, FUNDRAISING_STRESS } from '@/mock/money';
import { checklistByTitle, emptyChecklist, read } from './money-db';
import { giftStats } from './money-logic';
import type { FundraisingData, GiftRow, GiftSource } from './money-shared';

const FAILED: FundraisingData = { ...FUNDRAISING_MOCK, failed: true, mode: 'mock' };

// Loads the Fundraising page's data. `demo` is "error" (failed shape) or "stress" (the stress sample).
export async function loadFundraising({ demo }: { demo?: string } = {}): Promise<FundraisingData> {
  if (demo === 'error') return FAILED;
  const mock: FundraisingData = { ...(demo === 'stress' ? FUNDRAISING_STRESS : FUNDRAISING_MOCK), failed: false, mode: 'mock' };
  if (!hasSupabaseEnv()) return mock;
  try {
    const year = String(new Date().getFullYear());
    const [gifts, goals, checklist] = await Promise.all([
      read('gifts', 'id, gift_on, amount_cents, source, monthly, donor_id, donors(name)', { order: ['gift_on', false] }),
      read('goals', 'target_cents', { eq: { year: Number(year), metric: 'money_raised' }, limit: 1 }),
      checklistByTitle('Year-end giving'),
    ]);
    return {
      ...mock,
      ...giftStats(gifts, year),
      mode: 'live',
      goal_cents: Number(goals[0]?.target_cents ?? 0),
      recent: gifts.slice(0, 5).map(
        (g): GiftRow => ({ id: String(g.id), gift_on: String(g.gift_on), donor: String((g.donors as { name?: string } | null)?.name ?? 'Anonymous'), source: g.source as GiftSource, amount_cents: Number(g.amount_cents) }),
      ),
      checklist: checklist ?? emptyChecklist('Year-end giving'),
    };
  } catch {
    return FAILED;
  }
}

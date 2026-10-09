// Money > Fundraising: the data. Types mirror the draft Ops Hub schema (gifts, donors, goals, checklists + tasks).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: the gifts read and the sums are written but
// NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
import { hasSupabaseEnv } from '@btx/data';
import { FUNDRAISING_MOCK, FUNDRAISING_STRESS } from '@/mock/money';
import { checklistByTitle, read } from './money-db';
import { GIFT_SOURCES, type FundraisingData, type GiftRow, type GiftSource } from './money-shared';

const FAILED: FundraisingData = { ...FUNDRAISING_MOCK, failed: true, mode: 'mock' };

// Loads the Fundraising page's data. `demo` is "error" (failed shape) or "stress" (the stress sample).
export async function loadFundraising({ demo }: { demo?: string } = {}): Promise<FundraisingData> {
  if (demo === 'error') return FAILED;
  const mock: FundraisingData = { ...(demo === 'stress' ? FUNDRAISING_STRESS : FUNDRAISING_MOCK), failed: false, mode: 'mock' };
  if (!hasSupabaseEnv()) return mock;
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const year = '2026';
    const gifts = await read('gifts', 'id, gift_on, amount_cents, source, monthly, donor_id, donors(name)', { order: ['gift_on', false] });
    const inYear = gifts.filter((g) => String(g.gift_on).startsWith(year));
    const sum = (rows: typeof gifts) => rows.reduce((t, g) => t + Number(g.amount_cents), 0);
    const raised = sum(inYear);
    const donorIds = new Set(inYear.map((g) => g.donor_id).filter(Boolean));
    // A donor is new this year when none of their gifts is dated before the year.
    const earlier = new Set(gifts.filter((g) => String(g.gift_on) < year).map((g) => g.donor_id));
    const monthly = new Set(inYear.filter((g) => g.monthly).map((g) => g.donor_id).filter(Boolean));
    const q3 = sum(inYear.filter((g) => String(g.gift_on) >= `${year}-07-01` && String(g.gift_on) <= `${year}-09-30`));
    const checklist = (await checklistByTitle('Year-end giving')) ?? mock.checklist;
    return {
      ...mock,
      mode: 'live',
      raised_cents: raised,
      q3_cents: q3,
      donors: donorIds.size,
      avg_gift_cents: inYear.length ? Math.round(raised / inYear.length) : 0,
      new_donors: [...donorIds].filter((d) => !earlier.has(d)).length,
      monthly_donors: monthly.size,
      sources: GIFT_SOURCES.map((s) => ({ key: s.key, label: s.label, cents: sum(inYear.filter((g) => g.source === s.key)) })),
      recent: gifts.slice(0, 5).map(
        (g): GiftRow => ({ id: String(g.id), gift_on: String(g.gift_on), donor: String((g.donors as { name?: string } | null)?.name ?? 'Anonymous'), source: g.source as GiftSource, amount_cents: Number(g.amount_cents) }),
      ),
      checklist,
      // TODO (live): goal_cents comes from the year's goals row (goals table); the mock's $15,000 stays until that read exists.
    };
  } catch {
    return FAILED;
  }
}

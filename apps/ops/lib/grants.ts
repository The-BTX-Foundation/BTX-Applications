// Money > Grants: the data. Types mirror the draft Ops Hub schema (grants, checklists + tasks).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: the grants read is written but NOT TESTED:
// needs the Ops Hub tables (draft schema, not applied).
import { hasSupabaseEnv } from '@btx/data';
import { GRANTS_MOCK, GRANTS_STRESS } from '@/mock/money';
import { checklistByTitle, profiles, read } from './money-db';
import { GRANT_STAGES, type GrantRow, type GrantsData, type GrantStage } from './money-shared';

const FAILED: GrantsData = { ...GRANTS_MOCK, failed: true, mode: 'mock' };

// Loads the Grants page's data. `demo` is "error" (failed shape) or "stress" (the stress sample).
export async function loadGrants({ demo }: { demo?: string } = {}): Promise<GrantsData> {
  if (demo === 'error') return FAILED;
  const mock: GrantsData = { ...(demo === 'stress' ? GRANTS_STRESS : GRANTS_MOCK), failed: false, mode: 'mock' };
  if (!hasSupabaseEnv()) return mock;
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const [rows, people, checklist] = await Promise.all([
      read('grants', 'id, name, funder, amount_cents, amount_is_up_to, stage, outcome, deadline_on, date_note, submitted_on, owner_id', { order: ['deadline_on', true] }),
      profiles(),
      checklistByTitle('Getting started with grants'),
    ]);
    const grants = rows.map((r): GrantRow => {
      const p = r.owner_id ? people.get(String(r.owner_id)) : undefined;
      return {
        id: String(r.id),
        name: String(r.name),
        funder: (r.funder as string | null) ?? null,
        amount_cents: r.amount_cents == null ? null : Number(r.amount_cents),
        amount_is_up_to: Boolean(r.amount_is_up_to),
        stage: r.stage as GrantStage,
        outcome: (r.outcome as GrantRow['outcome']) ?? null,
        deadline_on: (r.deadline_on as string | null) ?? null,
        date_note: (r.date_note as string | null) ?? null,
        submitted_on: (r.submitted_on as string | null) ?? null,
        owner: p ? { kind: 'person', user_id: String(r.owner_id), name: p.name, initials: p.initials } : null,
      };
    });
    const counts = Object.fromEntries(GRANT_STAGES.map((s) => [s, grants.filter((g) => g.stage === s).length])) as Record<GrantStage, number>;
    return { ...mock, mode: 'live', count: grants.length, counts, grants, checklist: checklist ?? mock.checklist };
  } catch {
    return FAILED;
  }
}

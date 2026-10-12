// Loads the cycle the settings page edits: the published one, else the newest draft (or the one named in ?cycle=).
// Reads as the signed-in person; staff can read every cycle row (cycles_select_staff).
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '@/lib/supabase-server';
import type { CycleRow } from '@/lib/cycle-settings';

const COLUMNS =
  'id, term, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end, decision_date, next_cycle_month, requirements, photo_due, payment_note, event_enabled, event_at';

export type SettingsData =
  | {
      state: 'ok';
      cycle: CycleRow;
      /** Applications of any status started in this cycle (decides whether Unpublish is offered). */
      applications: number;
      /** The term of a different cycle that is published, when this one is a draft. */
      otherPublishedTerm: string | null;
      canEdit: boolean;
    }
  | { state: 'none' }
  | { state: 'error' };

// A sample draft for mock mode (no Supabase env), so the page still draws.
const MOCK: CycleRow = {
  id: 'mock',
  term: 'Fall 2026',
  status: 'draft',
  award_name: 'Legacy Scholarship',
  award_amount_cents: null,
  opens_at: '2026-08-17T13:00:00Z',
  closes_at: null,
  interview_start: '2026-09-15',
  interview_end: '2026-10-09',
  decision_date: '2026-10-23',
  next_cycle_month: 'October',
  requirements: ['High school senior or current college student', 'Plans to study science, technology, engineering or math'],
  photo_due: null,
  payment_note: null,
  event_enabled: false,
  event_at: null,
};

export async function loadCycleSettings(cycleId?: string, opts: { forceError?: boolean } = {}): Promise<SettingsData> {
  if (opts.forceError) return { state: 'error' };
  if (!hasSupabaseEnv()) return { state: 'ok', cycle: MOCK, applications: 0, otherPublishedTerm: null, canEdit: true };
  try {
    const client = await sessionClient();
    const { data: auth } = await client.auth.getUser();
    const canEdit = auth.user?.app_metadata?.role === 'admin';
    let q = client.from('cycles').select(COLUMNS);
    if (cycleId && /^[0-9a-f-]{36}$/i.test(cycleId)) q = q.eq('id', cycleId);
    else q = q.neq('status', 'archived').order('status', { ascending: false }).order('created_at', { ascending: false });
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return { state: 'none' };
    const cycle = data as CycleRow;
    const { count, error: e2 } = await client.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycle.id);
    if (e2) throw e2;
    let otherPublishedTerm: string | null = null;
    if (cycle.status !== 'published') {
      const { data: other, error: e3 } = await client.from('cycles').select('term').eq('status', 'published').neq('id', cycle.id).maybeSingle();
      if (e3) throw e3;
      otherPublishedTerm = other?.term ?? null;
    }
    return { state: 'ok', cycle, applications: count ?? 0, otherPublishedTerm, canEdit };
  } catch {
    return { state: 'error' };
  }
}

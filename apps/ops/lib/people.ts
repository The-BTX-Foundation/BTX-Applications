// Admin > People and roles: the data. staff_profiles gives names and titles; the role and last sign-in come from
// staff_directory() (the role is read from app_metadata there; it is not a column).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: the two reads are written but NOT TESTED:
// needs the Ops Hub tables (draft schema, not applied).
import { hasSupabaseEnv } from '@btx/data';
import { PEOPLE_MOCK, PEOPLE_STRESS } from '@/mock/money';
import { MOCK_NOW } from '@/mock/applicants';
import { sessionClient } from './supabase-server';
import { read } from './money-db';
import { isStaffRole } from './role';
import type { PeopleData, PersonRow } from './money-shared';

const FAILED: PeopleData = { failed: true, mode: 'mock', me: 'dm', people: PEOPLE_MOCK, now: MOCK_NOW };

// Loads the People page's data for the signed-in person `me` (their user id). `demo` is "error" or "stress".
export async function loadPeople({ demo, me }: { demo?: string; me: string }): Promise<PeopleData> {
  if (demo === 'error') return FAILED;
  if (!hasSupabaseEnv()) return { failed: false, mode: 'mock', me: 'dm', people: demo === 'stress' ? PEOPLE_STRESS : PEOPLE_MOCK, now: MOCK_NOW };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const client = (await sessionClient()) as unknown as {
      rpc: (fn: string) => PromiseLike<{ data: { user_id: string; role: string; last_sign_in_at: string | null }[] | null; error: unknown }>;
    };
    const [profiles, dir] = await Promise.all([read('staff_profiles', 'user_id, display_name, initials, title', { order: ['created_at', true] }), client.rpc('staff_directory')]);
    if (dir.error) throw dir.error;
    const people: PersonRow[] = [];
    for (const p of profiles) {
      const d = (dir.data ?? []).find((x) => x.user_id === p.user_id);
      if (!d || !isStaffRole(d.role)) continue;
      people.push({ user_id: String(p.user_id), display_name: String(p.display_name), initials: String(p.initials), title: (p.title as string | null) ?? null, role: d.role, last_sign_in_at: d.last_sign_in_at });
    }
    return { failed: false, mode: 'live', me, people, now: new Date().toISOString() };
  } catch {
    return FAILED;
  }
}

// The signed-in person's staff user id: the fixture's Dania Morris in mock mode, the session's user id in live mode.
// Kept here (not in lib/user.ts) so the shell's own user type stays as it is.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { MOCK_ME } from '@/mock/staff';

export async function currentStaffId(): Promise<string | null> {
  if (!hasSupabaseEnv()) return MOCK_ME;
  try {
    const client = await sessionClient();
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

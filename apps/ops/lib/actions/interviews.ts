'use server';

// Write actions for Scholarships > Interviews.
//
// Re-run pairing. The draft schema (interview_pairings, admin-only writes) defines no pairing algorithm or function, so
// there is nothing to call yet. In mock mode the action does nothing (the Figma preview says "Nothing would move").
// NOT TESTED, NEEDS THE OPS HUB TABLES: in live mode it reports that pairing is not connected rather than guessing.
import { hasSupabaseEnv } from '@btx/data';

export async function rerunPairing(): Promise<{ ok: boolean; message: string }> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Pairing ran again. Nothing moved.' };
  return { ok: false, message: 'Pairing is not connected yet. It needs the Ops Hub tables.' };
}

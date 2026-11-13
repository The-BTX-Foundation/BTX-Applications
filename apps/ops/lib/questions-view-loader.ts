// The Interview questions page's loader (shape in lib/questions-view.ts). Mock mode (no Supabase env) returns the demo's
// sample from mock/questions-view.ts; live mode builds the same shape from the real tables in lib/questions-live.ts and
// ignores every `?demo=` flag.
import { hasSupabaseEnv } from '@btx/data';
import { QN_VIEW, QN_VIEW_EMPTY, QN_VIEW_STRESS } from '@/mock/questions-view';
import { mockCaps } from './questions-map';
import { loadLiveQnView } from './questions-live';
import type { QnMockWrite, QnResult } from './questions-view';

/**
 * The mock view for a `?demo=` value (mock mode only): `stress`, `empty`, `error` (the demo's "didn't load" card under the
 * title), `failed` (the whole page's plain "didn't load" card), `board` (without admin rights: read only), `nexterror` (only
 * the next-interview panel failed), and `failsave` / `conflict` / `timeout` (the normal page; every write answers with that
 * failure). `?demo=loading` is handled by the page (the skeleton). Pure, so the flags are unit-tested.
 */
export function mockQn(demo?: string): QnResult {
  if (demo === 'failed') return { failed: true };
  const base = demo === 'stress' ? QN_VIEW_STRESS : demo === 'empty' ? QN_VIEW_EMPTY : QN_VIEW;
  const admin = demo !== 'board';
  const mockWrite: QnMockWrite = demo === 'failsave' || demo === 'conflict' || demo === 'timeout' ? demo : null;
  return { ...base, isAdmin: admin, caps: mockCaps(admin), loadFailed: demo === 'error', nextFailed: demo === 'nexterror', mockWrite, failed: false };
}

/** Loads what the page draws. `me` and `isAdmin` come from requireStaff (the auth server). */
export async function loadQnView({ demo, me, isAdmin }: { demo?: string; me: string | null; isAdmin: boolean }, live = hasSupabaseEnv()): Promise<QnResult> {
  if (!live) return mockQn(demo);
  const { sessionQnReader } = await import('./questions-db');
  return loadLiveQnView(sessionQnReader, me, isAdmin);
}

// The Applicants pages' loaders (refreshed pages, shapes in lib/applicants-view.ts). Mock mode (no Supabase env) returns
// the demo's sample from mock/applicants-view.ts; live mode builds the same shapes from the real tables in
// lib/applicants-live.ts. Read-only in both modes.
import { hasSupabaseEnv } from '@btx/data';
import { APPLICANTS_VIEW, APPLICANTS_VIEW_EMPTY, APPLICANTS_VIEW_STRESS, mockDetail } from '@/mock/applicants-view';
import { sessionReader } from './applicants-db';
import { loadLiveApplicant, loadLiveApplicants, type ApViewer } from './applicants-live';
import type { ApplicantDetailResult, ApplicantsResult } from './applicants-view';

/**
 * The mock list for a `?demo=` value (mock mode only; live mode ignores `demo`): `stress` the longest names and 141
 * applicants, `empty` none yet, `error` the demo's list-card error ("Couldn't load applicants."), `failed` the whole-page
 * "didn't load" card. (`?demo=loading` is handled by the page.)
 */
export function mockApplicants(demo?: string): ApplicantsResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? APPLICANTS_VIEW_STRESS : demo === 'empty' ? APPLICANTS_VIEW_EMPTY : APPLICANTS_VIEW;
  return { ...view, loadFailed: demo === 'error', failed: false };
}

/** The mock full application: `failed` the whole-page card; an unknown code is missing (404). */
export function mockApplicant(code: string, demo?: string): ApplicantDetailResult {
  if (demo === 'failed') return { failed: true, missing: false };
  const d = mockDetail(code);
  return d ? { ...d, failed: false, missing: false } : { failed: false, missing: true };
}

/** Loads what the list draws. */
export async function loadApplicantsView({ demo, viewer }: { demo?: string; viewer: ApViewer }): Promise<ApplicantsResult> {
  if (!hasSupabaseEnv()) return mockApplicants(demo);
  return loadLiveApplicants(sessionReader, viewer);
}

/**
 * Is there a submitted application with this code the signed-in person may read? One small read before the page streams,
 * so an unknown code answers a real 404. A failed read says yes: the full load then shows the "didn't load" card.
 */
export async function applicantExists(code: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return mockDetail(code) !== null;
  try {
    const rows = await sessionReader.all('applications', 'id', { eq: { applicant_code: code, status: 'submitted' }, order: ['id'] });
    return rows.length > 0;
  } catch {
    return true;
  }
}

/** Loads one full application by its code. */
export async function loadApplicantView({ code, demo, viewer }: { code: string; demo?: string; viewer: ApViewer }): Promise<ApplicantDetailResult> {
  if (!hasSupabaseEnv()) return mockApplicant(code, demo);
  return loadLiveApplicant(sessionReader, viewer, code);
}

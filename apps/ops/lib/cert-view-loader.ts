// The Certifications page's loader (refreshed page, shape in lib/cert-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/cert-view.ts; live mode builds the same shape from the real tables in lib/cert-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { certMockEmpty, certMockNormal, certMockStress } from '@/mock/cert-view';
import { certSessionReader } from './cert-db';
import { loadLiveCertView, type CertWho } from './cert-live';
import type { CertResult } from './cert-view';

/**
 * Loads what the Certifications page draws. Mock mode only (live mode ignores `demo`): `?demo=stress` the stress sample,
 * `?demo=empty` no steps and no ideas, `?demo=error` the demo's load error (the header and the checklist's "didn't load"
 * card), `?demo=chaterror` only the chat panel's own load error, `?demo=failsave` every write refused (to see "Couldn't
 * save. Try again." and the chat's "Not sent" row), `?demo=failed` the whole-page "didn't load" card. (`?demo=loading`
 * is handled by the page: the skeleton.)
 */
export async function loadCertView({ demo, who }: { demo?: string; who: CertWho }): Promise<CertResult> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? certMockStress() : demo === 'empty' ? certMockEmpty() : certMockNormal();
    if (demo === 'chaterror') view.chat = { ...view.chat, messages: [], failed: true };
    return { ...view, loadFailed: demo === 'error', failed: false };
  }
  return loadLiveCertView(certSessionReader, who);
}

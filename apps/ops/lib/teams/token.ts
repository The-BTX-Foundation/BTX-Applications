// SERVER ONLY. Gets a Microsoft Graph access token for BTX's Teams account, so the Ops Hub can make Teams meetings.
//
// Sign-in model: a public client (Microsoft Graph Command Line Tools), no client secret. The server holds a refresh token
// and trades it for a short-lived access token each time. Microsoft rotates refresh tokens: every trade hands back a new
// one, which is saved straight away in public.teams_auth (one row, readable and writable only with the service role;
// migration 20261106120000_teams_auth.sql). The env var BTX_TEAMS_REFRESH_TOKEN is the seed: it is used when the table
// has no row yet, and also when the saved token is refused (so putting a fresh token in the env var re-connects Teams).
//
// Tokens are never logged and never returned to a screen. Callers only get a plain reason when something is wrong.
import 'server-only';
import { createServiceClient, type ServiceClient } from '@btx/data/server';

/** BTX's Microsoft 365 tenant (admin@btxfoundation.onmicrosoft.com). */
export const TEAMS_TENANT = '78915995-e897-47de-b801-0d0dea583962';
/** Microsoft Graph Command Line Tools: a public client, so no secret is needed or stored. */
export const TEAMS_CLIENT_ID = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
export const TEAMS_SCOPE = 'OnlineMeetings.ReadWrite User.Read offline_access';
export const TEAMS_TOKEN_URL = `https://login.microsoftonline.com/${TEAMS_TENANT}/oauth2/v2.0/token`;
/** The env var that seeds the first refresh token on the server. */
export const TEAMS_ENV_VAR = 'BTX_TEAMS_REFRESH_TOKEN';
/** The single row's key in public.teams_auth. */
export const TEAMS_AUTH_ROW = 'btx';

/** Where the newest refresh token is kept. read() returns null when nothing is saved yet. */
export type TokenStore = { read: () => Promise<string | null>; write: (refreshToken: string) => Promise<void> };

export type TokenResult =
  | { ok: true; accessToken: string }
  /** not-connected: no saved token and no env seed (or no service key). refused: Microsoft turned every token down.
   * failed: Microsoft or the database could not be reached. */
  | { ok: false; reason: 'not-connected' | 'refused' | 'failed' };

/** The plain sentence an admin sees for each reason. */
export const TOKEN_MESSAGES: Record<Exclude<TokenResult, { ok: true }>['reason'], string> = {
  'not-connected': "Teams isn't connected yet.",
  refused: 'The Teams sign-in has expired. Teams needs to be connected again.',
  failed: "Couldn't reach Teams. Try again.",
};

type Trade = { ok: true; accessToken: string; refreshToken: string | null } | { ok: false; refused: boolean };

// Trades one refresh token for an access token (and, normally, a new refresh token). A 400 or 401 answer means
// Microsoft refused this token (expired, revoked, or not for this tenant); anything else is treated as "couldn't reach".
async function trade(refreshToken: string, f: typeof fetch): Promise<Trade> {
  let res: Response;
  try {
    res = await f(TEAMS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: TEAMS_CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken, scope: TEAMS_SCOPE }).toString(),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, refused: false };
  }
  if (res.status === 400 || res.status === 401) return { ok: false, refused: true };
  if (!res.ok) return { ok: false, refused: false };
  let body: { access_token?: unknown; refresh_token?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, refused: false };
  }
  if (typeof body.access_token !== 'string' || body.access_token === '') return { ok: false, refused: false };
  return { ok: true, accessToken: body.access_token, refreshToken: typeof body.refresh_token === 'string' && body.refresh_token !== '' ? body.refresh_token : null };
}

// Gets an access token. Tries the saved token first, then the env seed if it is different. Whichever works, the new
// refresh token Microsoft hands back is written to the store before returning. A failed write does not fail the call:
// the token just used normally stays valid for a while, so the next call can still sign in.
export async function getAccessToken(deps: { store: TokenStore | null; envToken?: string | null; fetch?: typeof fetch }): Promise<TokenResult> {
  const f = deps.fetch ?? fetch;
  // Without the service key nothing can be saved, so a rotated token would be lost: treat Teams as not connected.
  if (!deps.store) return { ok: false, reason: 'not-connected' };
  let saved: string | null;
  try {
    saved = await deps.store.read();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  const env = deps.envToken?.trim() || null;
  const tries = [...new Set([saved, env].filter((t): t is string => !!t))];
  if (tries.length === 0) return { ok: false, reason: 'not-connected' };
  for (const token of tries) {
    const r = await trade(token, f);
    if (!r.ok) {
      if (r.refused) continue; // try the next token (the env seed after a stale saved one)
      return { ok: false, reason: 'failed' };
    }
    // Save the newest refresh token. When Microsoft did not rotate it but the working token came from the env seed,
    // save that one so the table holds the token that works.
    const keep = r.refreshToken ?? token;
    if (keep !== saved) {
      try {
        await deps.store.write(keep);
      } catch {
        // see the comment above the function
      }
    }
    return { ok: true, accessToken: r.accessToken };
  }
  return { ok: false, reason: 'refused' };
}

/** The token store backed by public.teams_auth. RLS is on with no policies, so only this service-role client can reach it. */
export function serviceTokenStore(db: ServiceClient): TokenStore {
  return {
    async read() {
      const r = await db.from('teams_auth').select('refresh_token').eq('id', TEAMS_AUTH_ROW).maybeSingle();
      if (r.error) throw new Error('teams_auth read failed');
      const t = (r.data as { refresh_token?: string } | null)?.refresh_token;
      return typeof t === 'string' && t !== '' ? t : null;
    },
    async write(refreshToken: string) {
      const r = await db.from('teams_auth').upsert({ id: TEAMS_AUTH_ROW, refresh_token: refreshToken, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      // The database's error text never contains the token, but it is not passed on either.
      if (r.error) throw new Error('teams_auth write failed');
    },
  };
}

/** An access token for this server: the table through the service-role client, seeded from the env var. */
export async function serverAccessToken(f?: typeof fetch): Promise<TokenResult> {
  const db = createServiceClient();
  return getAccessToken({ store: db ? serviceTokenStore(db) : null, envToken: process.env[TEAMS_ENV_VAR], fetch: f });
}

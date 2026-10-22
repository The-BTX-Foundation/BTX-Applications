// Checks that a call to GET /api/calendar-sync comes from the BTX Apps Script and nothing else. The script sends
// `Authorization: Bearer <token>` where the token is ScriptApp.getIdentityToken(): an OpenID identity token signed by
// Google. It passes only when Google's signature checks out, the audience is the script's OAuth client ID
// (SYNC_CLIENT_ID), and the token belongs to SYNC_ACCOUNT with a verified email. No shared secret is involved.
// Fails closed on everything else. The token is never logged.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { SYNC_ACCOUNT, SYNC_CLIENT_ID } from './config';

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Google's public signing keys, fetched on first use and cached by jose (shared across calls on a warm server).
let googleKeys: JWTVerifyGetKey | null = null;
function googleKeySet(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_CERTS));
  return googleKeys;
}

export type VerifyOptions = {
  /** Tests pass a local key set (createLocalJWKSet) instead of Google's. */
  keySet?: JWTVerifyGetKey;
  /** Tests pass their own audience; defaults to SYNC_CLIENT_ID. */
  clientId?: string;
};

/** `{ ok: true }` only for a valid Google identity token of SYNC_ACCOUNT issued to the sync script; else `{ ok: false }`. */
export async function verifySyncCaller(authorizationHeader: string | null | undefined, opts: VerifyOptions = {}): Promise<{ ok: true } | { ok: false }> {
  const clientId = opts.clientId ?? SYNC_CLIENT_ID;
  // Not set up yet: refuse everyone rather than accept a token for any audience.
  if (!clientId) return { ok: false };
  // Exactly "Bearer <token>": one space, a non-empty token with no spaces.
  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader ?? '');
  if (!match) return { ok: false };
  try {
    const { payload } = await jwtVerify(match[1], opts.keySet ?? googleKeySet(), {
      algorithms: ['RS256'],
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (email !== SYNC_ACCOUNT || payload.email_verified !== true) return { ok: false };
    return { ok: true };
  } catch {
    // Bad signature, wrong issuer or audience, expired, malformed, or Google's keys unreachable: all refused.
    return { ok: false };
  }
}

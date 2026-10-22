import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { verifySyncCaller } from '@/lib/calendar-sync/verify-caller';
import { SYNC_CLIENT_ID } from '@/lib/calendar-sync/config';

// A throwaway RS256 key pair stands in for Google's signing keys.
const CLIENT = '123-test.apps.googleusercontent.com';
let keySet: JWTVerifyGetKey;
let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = await exportJWK(pair.publicKey);
  keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] });
});

// Signs an identity token like Google's, with any claim overridden.
async function token(over: JWTPayload & { iss?: string; aud?: string } = {}, opts: { key?: CryptoKey; exp?: number | string | null; iat?: number } = {}) {
  const { iss = 'https://accounts.google.com', aud = CLIENT, ...claims } = over;
  let jwt = new SignJWT({ email: 'info@thebtxfoundation.org', email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt(opts.iat);
  // exp: null leaves the expiry claim out entirely.
  if (opts.exp !== null) jwt = jwt.setExpirationTime(opts.exp ?? '5m');
  return jwt.sign(opts.key ?? privateKey);
}

const check = (header: string | null, clientId = CLIENT) => verifySyncCaller(header, { keySet, clientId });

describe('verifySyncCaller', () => {
  it('accepts a valid token for info@ issued to the sync script', async () => {
    expect(await check(`Bearer ${await token()}`)).toEqual({ ok: true });
    expect(await check(`Bearer ${await token({ iss: 'accounts.google.com' })}`)).toEqual({ ok: true });
    // Email case does not matter.
    expect(await check(`Bearer ${await token({ email: 'Info@TheBTXFoundation.org' })}`)).toEqual({ ok: true });
  });

  it('refuses the wrong audience, issuer, email, unverified email, expiry or signer', async () => {
    expect(await check(`Bearer ${await token({ aud: 'someone-else.apps.googleusercontent.com' })}`)).toEqual({ ok: false });
    expect(await check(`Bearer ${await token({ iss: 'https://evil.example' })}`)).toEqual({ ok: false });
    expect(await check(`Bearer ${await token({ email: 'dlittleton@thebtxfoundation.org' })}`)).toEqual({ ok: false });
    expect(await check(`Bearer ${await token({ email_verified: false })}`)).toEqual({ ok: false });
    expect(await check(`Bearer ${await token({ email: undefined })}`)).toEqual({ ok: false });
    expect(await check(`Bearer ${await token({}, { exp: Math.floor(Date.now() / 1000) - 60 })}`)).toEqual({ ok: false });
    expect(await check(`Bearer ${await token({}, { key: otherKey })}`)).toEqual({ ok: false });
  });

  it('refuses a token with no expiry, or one issued more than 65 minutes ago', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    expect(await check(`Bearer ${await token({}, { exp: null })}`)).toEqual({ ok: false });
    // Issued 67 minutes ago but (artificially) still unexpired: refused by the age limit alone (65 minutes plus the
    // minute of clock tolerance).
    expect(await check(`Bearer ${await token({}, { iat: nowSec - 67 * 60, exp: nowSec + 600 })}`)).toEqual({ ok: false });
    // Issued 60 minutes ago and unexpired: fine.
    expect(await check(`Bearer ${await token({}, { iat: nowSec - 60 * 60, exp: nowSec + 600 })}`)).toEqual({ ok: true });
  });

  it('allows a minute of clock difference: iat 30 s ahead is fine, 5 minutes ahead is refused', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    expect(await check(`Bearer ${await token({}, { iat: nowSec + 30, exp: nowSec + 3600 })}`)).toEqual({ ok: true });
    expect(await check(`Bearer ${await token({}, { iat: nowSec + 300, exp: nowSec + 3600 })}`)).toEqual({ ok: false });
  });

  it('refuses a missing or malformed header', async () => {
    const t = await token();
    expect(await check(null)).toEqual({ ok: false });
    expect(await check('')).toEqual({ ok: false });
    expect(await check('Bearer')).toEqual({ ok: false });
    expect(await check('Bearer ')).toEqual({ ok: false });
    expect(await check('bearer')).toEqual({ ok: false });
    expect(await check(`bearer ${t}`)).toEqual({ ok: false });
    expect(await check(`Basic ${t}`)).toEqual({ ok: false });
    expect(await check(t)).toEqual({ ok: false });
    expect(await check(`Bearer ${t} extra`)).toEqual({ ok: false });
    expect(await check('Bearer not.a.jwt')).toEqual({ ok: false });
  });

  it('fails closed when no client ID is set, even for an otherwise valid token', async () => {
    const t = await token({ aud: '' });
    expect(await check(`Bearer ${t}`, '')).toEqual({ ok: false });
    expect(await check(`Bearer ${await token()}`, '')).toEqual({ ok: false });
    // With no override, the configured SYNC_CLIENT_ID is used; while it is still empty, everything is refused.
    if (SYNC_CLIENT_ID === '') expect(await verifySyncCaller(`Bearer ${await token()}`, { keySet })).toEqual({ ok: false });
  });
});

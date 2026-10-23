// Apple Push Notification service over HTTP/2, for the BTX Ops Hub iPhone app. SERVER ONLY. Ported from the Yachtsy Driver
// Portal's sender, which has been delivering since 2026-09-20. Node's built-in `http2` is the whole transport: no
// dependency, no paid service.
//
// Env (set in Vercel by Dominick; the key is a secret):
//   APNS_KEY_ID      the 10-character key id Apple shows next to the .p8
//   APNS_TEAM_ID     the Apple Developer team id (6H2R38WKP3 for Yachtsy, LLC)
//   APNS_KEY         the .p8 contents, with real newlines or `\n` escaped
//   APNS_BUNDLE_ID   defaults to org.thebtxfoundation.opshub
//   APNS_PRODUCTION  'true' selects api.push.apple.com (TestFlight and App Store builds); anything else the sandbox
//
// With any of the three secrets missing, nothing is sent and the result says notConfigured. The key is never logged
// and never put in a returned detail.
import crypto from 'node:crypto';
import http2 from 'node:http2';

export const DEFAULT_BUNDLE_ID = 'org.thebtxfoundation.opshub';
/** One auth token is reused this long: Apple rejects tokens older than an hour and throttles making one more than every 20 minutes. */
export const TOKEN_TTL_MS = 40 * 60 * 1000;
/** A send that has not answered in this long is a retry, not a verdict. */
export const REQUEST_TIMEOUT_MS = 10_000;
/** APNs caps the payload at 4 KB. */
export const MAX_PAYLOAD_BYTES = 4096;

const PRODUCTION_HOST = 'api.push.apple.com';
const SANDBOX_HOST = 'api.sandbox.push.apple.com';

export type Env = Record<string, string | undefined>;
export type ApnsConfig = {
  configured: boolean;
  /** Variable names only, never values. */
  missing: string[];
  keyId: string;
  teamId: string;
  key: string;
  bundleId: string;
  production: boolean;
  host: string;
};

/** A .p8 pasted into an environment variable arrives with real newlines or with `\n` escaped. Accept both, and quotes. */
export function normalizePrivateKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) return '';
  return `${key}\n`;
}

export function readConfig(env: Env = process.env): ApnsConfig {
  const keyId = String(env.APNS_KEY_ID || '').trim();
  const teamId = String(env.APNS_TEAM_ID || '').trim();
  const key = normalizePrivateKey(env.APNS_KEY);
  const bundleId = String(env.APNS_BUNDLE_ID || '').trim() || DEFAULT_BUNDLE_ID;
  const production = String(env.APNS_PRODUCTION || '').trim().toLowerCase() === 'true';
  const missing: string[] = [];
  if (!keyId) missing.push('APNS_KEY_ID');
  if (!teamId) missing.push('APNS_TEAM_ID');
  if (!key) missing.push('APNS_KEY');
  return { configured: missing.length === 0, missing, keyId, teamId, key, bundleId, production, host: production ? PRODUCTION_HOST : SANDBOX_HOST };
}

export function isConfigured(env: Env = process.env): boolean {
  return readConfig(env).configured;
}

// One cached auth token: only one key id is ever in play, so the cache is a single slot that is replaced.
let tokenCache: { token: string; issuedAt: number; keyId: string; teamId: string } | null = null;
export function resetTokenCache(): void {
  tokenCache = null;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The APNs provider token: a JWT signed ES256, key id in the header, team id as issuer. */
export function getAuthToken(config: Pick<ApnsConfig, 'keyId' | 'teamId' | 'key'>, now: number = Date.now()): string {
  if (tokenCache && tokenCache.keyId === config.keyId && tokenCache.teamId === config.teamId && now - tokenCache.issuedAt < TOKEN_TTL_MS) return tokenCache.token;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signingInput = `${header}.${claims}`;
  const signature = b64url(crypto.createSign('SHA256').update(signingInput).sign({ key: config.key, dsaEncoding: 'ieee-p1363' }));
  const token = `${signingInput}.${signature}`;
  tokenCache = { token, issuedAt: now, keyId: config.keyId, teamId: config.teamId };
  return token;
}

export type SendOutcome = { result: 'delivered' | 'retry' | 'dead'; detail: string };

/**
 * Apple's answer, as one of three outcomes. Only the two "this phone's token is gone" answers are `dead`; a bad key, a wrong
 * team or clock skew (403) is OUR mistake and stays a retry, so one misconfiguration can never switch off every phone.
 */
export function classifyStatus(status: number, reason?: string): SendOutcome {
  const why = String(reason || '');
  if (status === 200) return { result: 'delivered', detail: 'apns accepted' };
  if (status === 410) return { result: 'dead', detail: `apns 410 ${why || 'Unregistered'}` };
  if (status === 400) {
    if (why === 'BadDeviceToken') return { result: 'dead', detail: 'apns 400 BadDeviceToken' };
    return { result: 'retry', detail: `apns 400 ${why || 'bad request'}` };
  }
  if (status === 403) return { result: 'retry', detail: `apns 403 ${why || 'authentication rejected'}: check APNS_KEY_ID, APNS_TEAM_ID and the server clock` };
  return { result: 'retry', detail: `apns ${status} ${why || 'transient failure'}`.trim() };
}

export type Notification = { title: string; body?: string; /** An Ops Hub path such as /tasks; the tap opens it. */ url?: string };

/** The notification body: an alert, a sound and the tap target under `url`. Trims the alert body if the whole is over 4 KB. */
export function buildPayload(n: Notification): string {
  const alert: { title: string; body?: string } = { title: n.title || 'BTX Ops Hub' };
  if (n.body && n.body.trim()) alert.body = n.body;
  const body: { aps: { alert: typeof alert; sound: string }; url?: string } = { aps: { alert, sound: 'default' } };
  if (n.url) body.url = n.url;
  let json = JSON.stringify(body);
  if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES && alert.body) {
    const over = Buffer.byteLength(json, 'utf8') - MAX_PAYLOAD_BYTES;
    alert.body = alert.body.slice(0, Math.max(0, alert.body.length - over - 4));
    json = JSON.stringify(body);
  }
  return json;
}

type Http2Like = Pick<typeof http2, 'connect'>;

function postToApns(o: { mod: Http2Like; config: ApnsConfig; deviceToken: string; authToken: string; json: string; timeoutMs: number }): Promise<{ status: number; reason: string }> {
  return new Promise((resolve, reject) => {
    let session: http2.ClientHttp2Session | undefined;
    let settled = false;
    const finish = (fn: (v: never) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        session?.close();
      } catch {
        // closing a broken session is not an error worth surfacing
      }
      fn(value as never);
    };
    const timer = setTimeout(() => {
      try {
        session?.destroy();
      } catch {
        // already gone
      }
      finish(reject, new Error('apns request timed out'));
    }, o.timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    try {
      session = o.mod.connect(`https://${o.config.host}`);
    } catch (err) {
      return finish(reject, err instanceof Error ? err : new Error('apns connect failed'));
    }
    session.on('error', (err) => finish(reject, err instanceof Error ? err : new Error('apns session error')));

    let request: http2.ClientHttp2Stream;
    try {
      request = session.request({
        ':method': 'POST',
        ':path': `/3/device/${o.deviceToken}`,
        authorization: `bearer ${o.authToken}`,
        'apns-topic': o.config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(o.json, 'utf8'),
      });
    } catch (err) {
      return finish(reject, err instanceof Error ? err : new Error('apns request failed'));
    }
    let status = 0;
    let raw = '';
    request.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('error', (err) => finish(reject, err instanceof Error ? err : new Error('apns stream error')));
    request.on('end', () => {
      let reason = '';
      if (raw) {
        try {
          reason = String(JSON.parse(raw)?.reason || '');
        } catch {
          reason = '';
        }
      }
      finish(resolve, { status, reason });
    });
    request.end(o.json);
  });
}

export type SendOptions = { env?: Env; http2?: Http2Like; now?: number; timeoutMs?: number };

/** Sends one notification to one phone. Never throws: every failure is a `retry` or a `dead`, so a push can't break the caller. */
export async function sendToDevice(deviceToken: string, n: Notification, options: SendOptions = {}): Promise<SendOutcome> {
  const config = readConfig(options.env ?? process.env);
  if (!config.configured) return { result: 'retry', detail: `apns not configured (missing ${config.missing.join(', ')})` };
  const token = String(deviceToken || '').trim();
  if (!token) return { result: 'retry', detail: 'no device token' };
  let authToken: string;
  try {
    authToken = getAuthToken(config, options.now);
  } catch {
    // The .p8 did not parse. Report that, never the key.
    console.error('[push] could not sign the APNs auth token: check APNS_KEY', { keyId: config.keyId });
    return { result: 'retry', detail: 'could not sign the apns auth token' };
  }
  let answer: { status: number; reason: string };
  try {
    answer = await postToApns({ mod: options.http2 ?? http2, config, deviceToken: token, authToken, json: buildPayload(n), timeoutMs: Number.isFinite(options.timeoutMs) ? (options.timeoutMs as number) : REQUEST_TIMEOUT_MS });
  } catch (err) {
    return { result: 'retry', detail: `apns transport failure: ${err instanceof Error ? err.message : 'unknown'}` };
  }
  const outcome = classifyStatus(answer.status, answer.reason);
  if (answer.status === 403) console.error('[push] APNs rejected our credentials: pushes are failing for every phone', { keyId: config.keyId, teamId: config.teamId, host: config.host, reason: answer.reason || null });
  return outcome;
}

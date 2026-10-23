import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, classifyStatus, isConfigured, normalizePrivateKey, readConfig, resetTokenCache, sendToDevice } from '@btx/push';
import { getAuthToken } from '../../../packages/push/src/apns';

// A real P-256 key, made for the test (the same kind as an Apple .p8).
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = { APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: '6H2R38WKP3', APNS_KEY: P8 };

// A fake of Node's http2: answers every request with the given status and JSON body, and records what was sent.
function fakeHttp2(status: number, body?: unknown, opts: { hang?: boolean } = {}) {
  const seen: { path?: string; headers?: Record<string, unknown>; json?: string; host?: string } = {};
  return {
    seen,
    mod: {
      connect(host: string) {
        seen.host = host;
        const session = Object.assign(new EventEmitter(), {
          close() {},
          destroy() {},
          request(headers: Record<string, unknown>) {
            seen.path = String(headers[':path']);
            seen.headers = headers;
            const stream = Object.assign(new EventEmitter(), {
              end(json: string) {
                seen.json = json;
                if (opts.hang) return;
                setTimeout(() => {
                  stream.emit('response', { ':status': status });
                  if (body !== undefined) stream.emit('data', JSON.stringify(body));
                  stream.emit('end');
                }, 0);
              },
            });
            return stream;
          },
        });
        return session;
      },
    } as never,
  };
}

beforeEach(() => resetTokenCache());

describe('configuration', () => {
  it('is configured only with all three secrets, and reports names never values', () => {
    expect(isConfigured({})).toBe(false);
    const c = readConfig({ APNS_KEY_ID: 'K' });
    expect(c.missing).toEqual(['APNS_TEAM_ID', 'APNS_KEY']);
    expect(JSON.stringify(c.missing)).not.toMatch(/BEGIN/);
    expect(isConfigured(ENV)).toBe(true);
  });
  it('uses sandbox unless APNS_PRODUCTION is exactly true, and the BTX bundle id by default', () => {
    expect(readConfig(ENV).host).toBe('api.sandbox.push.apple.com');
    expect(readConfig({ ...ENV, APNS_PRODUCTION: 'TRUE' }).host).toBe('api.push.apple.com');
    expect(readConfig({ ...ENV, APNS_PRODUCTION: 'yes' }).host).toBe('api.sandbox.push.apple.com');
    expect(readConfig(ENV).bundleId).toBe('org.thebtxfoundation.opshub');
  });
  it('reads a key pasted with escaped newlines or quotes', () => {
    const escaped = `"${P8.trim().replace(/\n/g, '\\n')}"`;
    expect(normalizePrivateKey(escaped)).toBe(P8.trim() + '\n');
    expect(normalizePrivateKey('not a key')).toBe('');
    expect(normalizePrivateKey(undefined)).toBe('');
  });
});

describe('the auth token', () => {
  it('is an ES256 token Apple can verify, and is reused inside 40 minutes', () => {
    const cfg = readConfig(ENV);
    const t = getAuthToken(cfg, 1_000_000);
    const [h, c, s] = t.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ iss: '6H2R38WKP3', iat: 1000 });
    expect(crypto.createVerify('SHA256').update(`${h}.${c}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
    expect(getAuthToken(cfg, 1_000_000 + 39 * 60_000)).toBe(t);
    expect(getAuthToken(cfg, 1_000_000 + 41 * 60_000)).not.toBe(t);
  });
});

describe('Apple\'s answers', () => {
  it.each([
    [200, '', 'delivered'],
    [410, 'Unregistered', 'dead'],
    [400, 'BadDeviceToken', 'retry'], // also what a wrong sandbox/production setting answers for every phone
    [400, 'BadTopic', 'retry'],
    [403, 'InvalidProviderToken', 'retry'],
    [429, 'TooManyRequests', 'retry'],
    [500, '', 'retry'],
  ])('%i %s is %s', (status, reason, result) => {
    expect(classifyStatus(status, reason).result).toBe(result);
  });
  it('never retires a phone because of our own bad key (403) or a mismatched environment (BadDeviceToken)', () => {
    expect(classifyStatus(403, 'ExpiredProviderToken').result).not.toBe('dead');
    expect(classifyStatus(400, 'BadDeviceToken').detail).toContain('APNS_PRODUCTION');
  });
});

describe('the payload', () => {
  it('has the alert, a sound and the tap target', () => {
    expect(JSON.parse(buildPayload({ title: 'T', body: 'B', url: '/tasks' }))).toEqual({ aps: { alert: { title: 'T', body: 'B' }, sound: 'default' }, url: '/tasks' });
  });
  it('omits an empty body and stays under 4 KB', () => {
    expect(JSON.parse(buildPayload({ title: 'T', body: '  ' })).aps.alert).toEqual({ title: 'T' });
    expect(Buffer.byteLength(buildPayload({ title: 'T', body: 'x'.repeat(6000), url: '/tasks' }), 'utf8')).toBeLessThanOrEqual(4096);
  });
});

describe('sending', () => {
  it('sends nothing and says why when the key is missing', async () => {
    const r = await sendToDevice('a'.repeat(64), { title: 'T' }, { env: {} });
    expect(r.result).toBe('retry');
    expect(r.detail).toMatch(/APNS_KEY/);
  });
  it('posts to the right host, path, topic and priority, and reads a 200', async () => {
    const f = fakeHttp2(200);
    const r = await sendToDevice('tok'.repeat(20), { title: 'Hello', body: 'World', url: '/chat' }, { env: { ...ENV, APNS_PRODUCTION: 'true' }, http2: f.mod });
    expect(r).toEqual({ result: 'delivered', detail: 'apns accepted' });
    expect(f.seen.host).toBe('https://api.push.apple.com');
    expect(f.seen.path).toBe(`/3/device/${'tok'.repeat(20)}`);
    expect(f.seen.headers).toMatchObject({ ':method': 'POST', 'apns-topic': 'org.thebtxfoundation.opshub', 'apns-push-type': 'alert', 'apns-priority': '10' });
    expect(String(f.seen.headers!.authorization)).toMatch(/^bearer ey/);
    expect(JSON.parse(f.seen.json!).url).toBe('/chat');
  });
  it('retires a phone Apple says is gone', async () => {
    expect((await sendToDevice('t'.repeat(64), { title: 'T' }, { env: ENV, http2: fakeHttp2(410, { reason: 'Unregistered' }).mod })).result).toBe('dead');
  });
  it('treats a slow Apple as a retry, not a verdict', async () => {
    const r = await sendToDevice('t'.repeat(64), { title: 'T' }, { env: ENV, http2: fakeHttp2(200, undefined, { hang: true }).mod, timeoutMs: 20 });
    expect(r.result).toBe('retry');
    expect(r.detail).toMatch(/timed out/);
  });
  it('treats a key that does not parse as a retry and never prints it', async () => {
    const spy = { text: '' };
    const orig = console.error;
    console.error = (...a: unknown[]) => { spy.text += JSON.stringify(a); };
    try {
      const bad = { ...ENV, APNS_KEY: '-----BEGIN PRIVATE KEY-----\nnotakey\n-----END PRIVATE KEY-----' };
      const r = await sendToDevice('t'.repeat(64), { title: 'T' }, { env: bad, http2: fakeHttp2(200).mod });
      expect(r.result).toBe('retry');
      expect(JSON.stringify(r) + spy.text).not.toMatch(/notakey|BEGIN/);
    } finally {
      console.error = orig;
    }
  });
  it('a 403 drops the cached auth token and logs no key id or team id', async () => {
    const cfg = readConfig(ENV);
    const t = 1_700_000_000_000;
    const first = getAuthToken(cfg, t);
    expect(getAuthToken(cfg, t)).toBe(first); // cached
    let text = '';
    const orig = console.error;
    console.error = (...a: unknown[]) => { text += JSON.stringify(a); };
    try {
      const r = await sendToDevice('t'.repeat(64), { title: 'T' }, { env: ENV, now: t, http2: fakeHttp2(403, { reason: 'InvalidProviderToken' }).mod });
      expect(r.result).toBe('retry');
    } finally {
      console.error = orig;
    }
    expect(getAuthToken(cfg, t)).not.toBe(first); // a fresh one is signed (ECDSA signatures differ every time)
    expect(text).not.toMatch(/ABC123DEFG|6H2R38WKP3/);
  });
});

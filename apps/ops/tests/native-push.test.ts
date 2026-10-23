import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nativePush, safePath } from '@/lib/native-push';

type Cb = (e: { value?: string; error?: string }) => void;

// A stand-in for the iPhone app's window.Capacitor and the page's storage.
function phone(opts: { perm?: string; askResult?: string; token?: string | null; native?: boolean; plainHandles?: boolean } = {}) {
  const { perm = 'prompt', askResult = 'granted', token = 'ab'.repeat(32), native = true, plainHandles = false } = opts;
  const store = new Map<string, string>();
  const handlers = new Map<string, Cb>();
  const removed: string[] = [];
  const plugin = {
    checkPermissions: vi.fn(async () => ({ receive: perm })),
    requestPermissions: vi.fn(async () => ({ receive: askResult })),
    register: vi.fn(async () => {
      if (token) handlers.get('registration')?.({ value: token });
      else handlers.get('registrationError')?.({ error: 'no' });
    }),
    // The iPhone app's page-side bridge returns the handle itself; a bundled plugin returns a promise of it. Both must work.
    addListener: vi.fn((event: string, cb: Cb) => {
      handlers.set(event, cb);
      const handle = { remove: () => void removed.push(event) };
      return plainHandles ? handle : Promise.resolve(handle);
    }),
  };
  const win = {
    Capacitor: { isNativePlatform: () => native, isPluginAvailable: (n: string) => n === 'PushNotifications', Plugins: { PushNotifications: plugin } },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    location: { href: '' },
  };
  vi.stubGlobal('window', win);
  return { plugin, store, removed, win, handlers };
}

describe('nativePush', () => {
  const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json({ ok: true }));
  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is null on a website: no window, no Capacitor, not native, or no push plugin', () => {
    expect(nativePush()).toBeNull(); // node: no window
    phone({ native: false });
    expect(nativePush()).toBeNull();
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => false } });
    expect(nativePush()).toBeNull();
    vi.stubGlobal('window', {});
    expect(nativePush()).toBeNull();
  });

  it('turning on asks iOS once, gets a token, saves it for the signed-in person and remembers it', async () => {
    const p = phone();
    const r = await nativePush()!.enable();
    expect(r).toEqual({ ok: true });
    expect(p.plugin.requestPermissions).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/push/register');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'ab'.repeat(32), label: 'iPhone' });
    expect(nativePush()!.isOn()).toBe(true);
    expect(p.removed.sort()).toEqual(['registration', 'registrationError']); // listeners are cleaned up
  });

  it('does not ask again when already allowed, and stops with "denied" when refused', async () => {
    const allowed = phone({ perm: 'granted' });
    expect(await nativePush()!.enable()).toEqual({ ok: true });
    expect(allowed.plugin.requestPermissions).not.toHaveBeenCalled();
    const refused = phone({ perm: 'prompt', askResult: 'denied' });
    expect(await nativePush()!.enable()).toEqual({ ok: false, reason: 'denied' });
    expect(refused.plugin.register).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the first (allowed) run saved anything
    expect(nativePush()!.isOn()).toBe(false);
    phone({ perm: 'denied' });
    expect(await nativePush()!.enable()).toEqual({ ok: false, reason: 'denied' });
  });

  it('reports a timeout when Apple gives no token, and an error when the server will not save it', async () => {
    phone({ token: null });
    expect(await nativePush()!.enable()).toEqual({ ok: false, reason: 'timeout' });
    phone();
    fetchMock.mockImplementation(async () => new Response('no', { status: 500 }));
    expect(await nativePush()!.enable()).toEqual({ ok: false, reason: 'error' });
    // an ended session answers 200 with the sign-in page, which is not a registration
    fetchMock.mockImplementation(async () => new Response('<html>sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(await nativePush()!.enable()).toEqual({ ok: false, reason: 'error' });
    expect(nativePush()!.isOn()).toBe(false);
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await nativePush()!.enable()).toEqual({ ok: false, reason: 'error' });
  });

  it('turning off tells the server and forgets the token; with nothing remembered it only forgets', async () => {
    const p = phone();
    const np = nativePush()!;
    await np.enable();
    fetchMock.mockClear();
    await np.disable();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/push/unregister');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ token: 'ab'.repeat(32) });
    expect(np.isOn()).toBe(false);
    expect(p.store.size).toBe(0);
    fetchMock.mockClear();
    await np.disable();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the current permission, and opens the iPhone Settings page', async () => {
    const p = phone({ perm: 'denied' });
    const np = nativePush()!;
    expect(await np.permission()).toBe('denied');
    np.openSettings();
    expect(p.win.location.href).toBe('app-settings:');
  });

  it('still works when storage is blocked', async () => {
    const p = phone();
    p.win.localStorage.setItem = () => {
      throw new Error('blocked');
    };
    p.win.localStorage.getItem = () => {
      throw new Error('blocked');
    };
    expect(await nativePush()!.enable()).toEqual({ ok: true });
    expect(nativePush()!.isOn()).toBe(false);
  });

  it('status asks the server about this phone\'s remembered token, and says nothing is on when none is remembered', async () => {
    phone();
    const np = nativePush()!;
    expect(await np.status()).toEqual({ known: false, on: false });
    expect(fetchMock).not.toHaveBeenCalled();
    await np.enable();
    fetchMock.mockImplementation(async () => json({ known: true, on: false }));
    expect(await np.status()).toEqual({ known: true, on: false });
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/push/status');
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }));
    expect(await np.status()).toBeNull();
  });

  it('refresh registers the current token again, but only when iOS already allows it', async () => {
    phone({ perm: 'granted' });
    expect(await nativePush()!.refresh()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/push/register');
    phone({ perm: 'prompt' });
    fetchMock.mockClear();
    expect(await nativePush()!.refresh()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    phone({ perm: 'granted', token: null });
    expect(await nativePush()!.refresh()).toBe(false);
  });

  it('forget drops the remembered registration without calling the server', async () => {
    phone();
    const np = nativePush()!;
    await np.enable();
    fetchMock.mockClear();
    np.forget();
    expect(np.isOn()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('works when the shell\'s bridge hands back plain listener handles instead of promises (the real iPhone app does)', async () => {
    const p = phone({ plainHandles: true, perm: 'granted' });
    expect(await nativePush()!.enable()).toEqual({ ok: true });
    expect(p.removed.sort()).toEqual(['registration', 'registrationError']);
    const opened: string[] = [];
    const stop = nativePush()!.onOpen((path) => opened.push(path));
    await Promise.resolve();
    (p.handlers.get('pushNotificationActionPerformed') as (e: unknown) => void)({ notification: { data: { url: '/chat' } } });
    expect(opened).toEqual(['/chat']);
    stop();
    expect(p.removed).toContain('pushNotificationActionPerformed');
  });

  it('a tapped push opens only a path on this site', async () => {
    const p = phone();
    const opened: string[] = [];
    const stop = nativePush()!.onOpen((path) => opened.push(path));
    await Promise.resolve();
    const fire = (url: unknown) => (p.handlers.get('pushNotificationActionPerformed') as ((e: unknown) => void))({ notification: { data: { url } } });
    fire('/scholarships/interviews');
    fire('//evil.example/x');
    fire('https://evil.example/');
    fire('/\\evil.example');
    fire(undefined);
    expect(opened).toEqual(['/scholarships/interviews']);
    stop();
    expect(p.removed).toContain('pushNotificationActionPerformed');
  });
});

describe('safePath', () => {
  it('accepts a site path and refuses everything else', () => {
    expect(safePath('/chat')).toBe('/chat');
    expect(safePath('/tasks?x=1#top')).toBe('/tasks?x=1#top');
    for (const bad of ['//a.b', '/\\a.b', 'https://a.b', 'javascript:alert(1)', 'chat', '', '/a b', '/a\nb', 5, null, undefined, `/${'a'.repeat(250)}`]) expect(safePath(bad)).toBeNull();
  });
});

// Push notifications as the iPhone app sees them. The Ops Hub runs inside the BTX Ops Hub app (apps/ops/mobile), which
// injects window.Capacitor into the page; there is nothing to import, so the website carries no extra code. On the website
// (or any browser) nativePush() is null and the Notifications row never shows.
//
// Registering a phone: ask iOS for permission (its own "Allow notifications?" prompt, shown once), ask for a token, then
// tell the server (/api/push/register), which keeps it against the signed-in person.

export type PushPermission = 'granted' | 'denied' | 'prompt';
export type EnableResult = { ok: true } | { ok: false; reason: 'denied' | 'timeout' | 'error' };

type Listener = { remove: () => unknown };
type Plugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  // Capacitor's page-side bridge returns the listener handle directly (not a promise) for a plugin it did not bundle; a bundled plugin returns a promise. Callers wrap the result in Promise.resolve.
  addListener: (event: string, cb: (e: { value?: string; error?: string; notification?: unknown }) => void) => Promise<Listener> | Listener;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean; Plugins?: Record<string, unknown> };

const STORE_KEY = 'btx-push-token';
const REGISTER_WAIT_MS = 20_000;

const permissionOf = (receive: string | undefined): PushPermission => (receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt');

function plugin(): Plugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.('PushNotifications')) return null;
  const p = cap.Plugins?.PushNotifications as Plugin | undefined;
  return p && typeof p.checkPermissions === 'function' ? p : null;
}

const remembered = (): string | null => {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};
const remember = (token: string | null) => {
  try {
    if (token) window.localStorage.setItem(STORE_KEY, token);
    else window.localStorage.removeItem(STORE_KEY);
  } catch {
    // storage blocked: the switch just shows Off next time
  }
};

/** A JSON POST to this site. Null on any failure, including a redirect to sign-in (an ended session answers 200 with the sign-in page). */
async function post(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
    if (!r.ok || r.redirected || !(r.headers.get('content-type') ?? '').includes('application/json')) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Asks iOS for a token: listens first, then registers, and gives up after a while. Null when Apple gives none. */
function fetchToken(p: Plugin): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const listeners: Listener[] = [];
    const done = (v: string | null) => {
      clearTimeout(timer);
      listeners.forEach((l) => void l.remove());
      resolve(v);
    };
    const timer = setTimeout(() => done(null), REGISTER_WAIT_MS);
    void Promise.all([
      Promise.resolve(p.addListener('registration', (e) => done(e.value ?? null))),
      Promise.resolve(p.addListener('registrationError', () => done(null))),
    ]).then((l) => {
      listeners.push(...l);
      return p.register();
    }).catch(() => done(null));
  });
}

export type PushStatus = { known: boolean; on: boolean };

export type NativePush = {
  /** What iOS allows for this app right now. */
  permission: () => Promise<PushPermission>;
  /** True when this phone remembers a registration (it may be stale: ask status() before trusting it). */
  isOn: () => boolean;
  /** What the server holds for the signed-in person and this phone, or null when it can't be reached. */
  status: () => Promise<PushStatus | null>;
  enable: () => Promise<EnableResult>;
  /** Re-sends the phone's current token for the signed-in person (clears a switched-off row, follows a changed token). Needs permission already given. */
  refresh: () => Promise<boolean>;
  /** Turns it off on the server (best effort) and forgets this phone's registration. */
  disable: () => Promise<void>;
  /** Forgets this phone's registration without telling the server (it belongs to someone else's session now). */
  forget: () => void;
  openSettings: () => void;
  /** Calls `open` with the Ops Hub path a tapped push carries. Returns a function that stops listening. */
  onOpen: (open: (path: string) => void) => () => void;
};

/** Only a path on this site: starts with one slash, no "//", no backslash, no control characters. */
export function safePath(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 200 && /^\/(?![/\\])[^\s\\\u0000-\u001f]*$/.test(value) ? value : null;
}

/** The app's push features, or null when this page is not running inside the BTX Ops Hub app. */
export function nativePush(): NativePush | null {
  const p = plugin();
  if (!p) return null;
  return {
    permission: async () => permissionOf((await p.checkPermissions()).receive),
    isOn: () => Boolean(remembered()),
    async status() {
      const token = remembered();
      if (!token) return { known: false, on: false };
      const r = await post('/api/push/status', { token });
      return r && typeof r.on === 'boolean' && typeof r.known === 'boolean' ? { known: r.known, on: r.on } : null;
    },
    async enable() {
      try {
        let perm = permissionOf((await p.checkPermissions()).receive);
        if (perm === 'prompt') perm = permissionOf((await p.requestPermissions()).receive);
        if (perm !== 'granted') return { ok: false, reason: 'denied' };
        const token = await fetchToken(p);
        if (!token) return { ok: false, reason: 'timeout' };
        const saved = await post('/api/push/register', { token, label: 'iPhone' });
        if (!saved?.ok) return { ok: false, reason: 'error' };
        remember(token);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'error' };
      }
    },
    async refresh() {
      try {
        if (permissionOf((await p.checkPermissions()).receive) !== 'granted') return false;
        const token = await fetchToken(p);
        if (!token) return false;
        const saved = await post('/api/push/register', { token, label: 'iPhone' });
        if (!saved?.ok) return false;
        remember(token);
        return true;
      } catch {
        return false;
      }
    },
    async disable() {
      const token = remembered();
      if (token) await post('/api/push/unregister', { token });
      remember(null);
    },
    forget: () => remember(null),
    openSettings() {
      window.location.href = 'app-settings:';
    },
    onOpen(open) {
      let handle: Listener | null = null;
      let stopped = false;
      try {
        void Promise.resolve(
          p.addListener('pushNotificationActionPerformed', (e) => {
            const target = safePath((e as { notification?: { data?: { url?: unknown } } }).notification?.data?.url);
            if (target) open(target);
          }),
        )
          .then((l) => {
            if (stopped) void l.remove();
            else handle = l;
          })
          .catch(() => {});
      } catch {
        // a listener that cannot be added just means a tap opens the app on the page it was on; it never breaks the page
      }
      return () => {
        stopped = true;
        if (handle) void handle.remove();
      };
    },
  };
}

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
  addListener: (event: string, cb: (e: { value?: string; error?: string }) => void) => Promise<Listener>;
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

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok;
  } catch {
    return false;
  }
}

export type NativePush = {
  /** What iOS allows for this app right now. */
  permission: () => Promise<PushPermission>;
  /** True when this phone has a token registered with the server for the signed-in person. */
  isOn: () => boolean;
  enable: () => Promise<EnableResult>;
  disable: () => Promise<void>;
  openSettings: () => void;
};

/** The app's push features, or null when this page is not running inside the BTX Ops Hub app. */
export function nativePush(): NativePush | null {
  const p = plugin();
  if (!p) return null;
  return {
    permission: async () => permissionOf((await p.checkPermissions()).receive),
    isOn: () => Boolean(remembered()),
    async enable() {
      try {
        let perm = permissionOf((await p.checkPermissions()).receive);
        if (perm === 'prompt') perm = permissionOf((await p.requestPermissions()).receive);
        if (perm !== 'granted') return { ok: false, reason: 'denied' };
        const token = await new Promise<string | null>((resolve) => {
          const listeners: Listener[] = [];
          const done = (v: string | null) => {
            clearTimeout(timer);
            listeners.forEach((l) => void l.remove());
            resolve(v);
          };
          const timer = setTimeout(() => done(null), REGISTER_WAIT_MS);
          void Promise.all([
            p.addListener('registration', (e) => done(e.value ?? null)),
            p.addListener('registrationError', () => done(null)),
          ]).then((l) => {
            listeners.push(...l);
            return p.register();
          }).catch(() => done(null));
        });
        if (!token) return { ok: false, reason: 'timeout' };
        const saved = await post('/api/push/register', { token, label: 'iPhone' });
        if (!saved) return { ok: false, reason: 'error' };
        remember(token);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'error' };
      }
    },
    async disable() {
      const token = remembered();
      if (token) await post('/api/push/unregister', { token });
      remember(null);
    },
    openSettings() {
      window.location.href = 'app-settings:';
    },
  };
}

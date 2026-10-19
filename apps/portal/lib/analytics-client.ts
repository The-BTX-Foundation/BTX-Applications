// Google Analytics 4 for the Portal: the browser side. Decides whether the Google tag may load, loads it, sends a page
// view on every screen change, and is the one way our own code sends an event (track()). The rules it applies (which
// events, which parameters, clean page addresses, the hit filter) are in lib/analytics.ts. Owner notes: ANALYTICS.md.
//
// The tag loads only when all of these hold: a measurement id is set, the page is on the production host, the browser
// does not send Global Privacy Control, this browser has not been switched off (?analytics=off, or a staff or test
// account signed in here once), and nobody signed in is staff or a tester. Otherwise events still land in the page's
// own dataLayer, which is how tests and previews check them, and nothing leaves the browser.
import { getAuthMode, getBrowserClient } from '@btx/data';
import {
  LINKED_DOMAINS,
  PAGE_VIEW_MARK,
  PRODUCTION_HOST,
  SIGNUP_COOKIE,
  STEP_KEYS,
  cleanLocation,
  cleanParams,
  cleanPath,
  cleanReferrer,
  isStaffOrTester,
  measurementId,
  routeInfo,
  scrubHit,
  stepNumber,
  type ParamValue,
} from './analytics';

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag; __btxAnalyticsGuard?: boolean };

/** The localStorage key that switches measuring off in this browser ('manual' or 'account'). */
export const OFF_KEY = 'btx-analytics-off';

// Page review fixtures (?demo, ?preview, ?stress) show sample data: they are not real visits, so they are not measured.
const FIXTURE_PARAMS = ['demo', 'preview', 'stress'];

const state: {
  started: boolean;
  ready: boolean;
  off: boolean;
  tag: boolean;
  lastLocation: string;
  queue: Array<() => void>;
} = { started: false, ready: false, off: false, tag: false, lastLocation: '', queue: [] };

// The page's gtag function, created as a stub that records into dataLayer when the Google tag is not there.
function gtag(...args: unknown[]): void {
  const w = window as AnalyticsWindow;
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag !== 'function') {
    // gtag.js reads the arguments object itself, so the stub must push `arguments`, not an array
    w.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  w.gtag(...args);
}

// Runs a send now when set-up is done, or queues it until then (pages can send before the set-up finishes).
function whenReady(send: () => void): void {
  if (state.off) return;
  if (state.ready) send();
  else state.queue.push(send);
}

// True when this page is a review fixture (sample data), from the address's query.
function isFixture(): boolean {
  const query = new URLSearchParams(window.location.search);
  return FIXTURE_PARAMS.some((key) => query.has(key));
}

/** Sends one of our own events. Unknown events, denied or unknown parameters and out-of-range values are dropped by
 *  cleanParams (lib/analytics.ts) before anything is recorded. Nothing is sent from a review fixture page. */
export function track(event: string, params: Record<string, ParamValue> = {}): void {
  if (typeof window === 'undefined' || isFixture()) return;
  const payload = cleanParams(event, params);
  if (!payload) return;
  whenReady(() => gtag('event', event, payload));
}

/** Sends a page view for the page now on screen, and the step event when it is an application step. Called on every
 *  screen change. The address, referrer and title are the clean forms (lib/analytics.ts), never the real ones. */
export function pageView(): void {
  if (typeof window === 'undefined' || isFixture()) return;
  const location = cleanLocation(window.location.href);
  const path = cleanPath(window.location.pathname);
  const { title, group } = routeInfo(path);
  // the first page's referrer is the real one, cleaned; after that it is the previous Portal page
  const referrer = state.lastLocation || cleanReferrer(document.referrer, window.location.origin);
  state.lastLocation = location;
  whenReady(() => {
    const page = { page_location: location, page_referrer: referrer, page_title: title, content_group: group };
    // `set` first, so the tag's own engagement pings for this page carry the same clean values
    gtag('set', page);
    // the mark tells the hit filter this page view is ours (it is removed before the hit leaves)
    gtag('event', 'page_view', { ...page, [PAGE_VIEW_MARK]: '1' });
  });
  const step = stepNumber(path);
  if (step) track('application_step', { step_number: step, step_name: STEP_KEYS[step - 1] });
}

// Reads this browser's switch. Storage can be blocked (private mode); then the switch is simply not set.
function readOff(): boolean {
  try {
    return Boolean(window.localStorage.getItem(OFF_KEY));
  } catch {
    return false;
  }
}

// Turns measuring off in this browser from now on: no more sends, the filter drops every hit, and the tag is told
// analytics storage is denied. `reason` is stored so the owner notes can tell a manual switch from a staff account.
function switchOff(reason: 'manual' | 'account'): void {
  state.off = true;
  state.queue = [];
  try {
    window.localStorage.setItem(OFF_KEY, reason);
  } catch {
    // storage blocked: off for this page only
  }
  if (state.tag) gtag('consent', 'update', { analytics_storage: 'denied' });
}

// Applies ?analytics=off and ?analytics=on (a board member's own browser). The parameter never reaches Google: page
// addresses keep only campaign tags.
function applySwitchFromAddress(): void {
  const value = new URLSearchParams(window.location.search).get('analytics');
  if (value === 'off') switchOff('manual');
  if (value === 'on') {
    try {
      window.localStorage.removeItem(OFF_KEY);
    } catch {
      // storage blocked: nothing to clear
    }
  }
}

// Who is signed in: 'staff' (a staff role or a non-Terpmail test address), 'other' (an applicant, or nobody), or
// 'unknown' when the session can't be read. Mock mode has no real accounts.
async function signedInAccount(): Promise<'staff' | 'other' | 'unknown'> {
  if (getAuthMode() !== 'supabase') return 'other';
  try {
    const { data } = await getBrowserClient().auth.getSession();
    return isStaffOrTester(data.session?.user) ? 'staff' : 'other';
  } catch {
    return 'unknown';
  }
}

// Watches for a staff or test account signing in after the page loaded (the sign-in screen changes pages without a
// reload), and switches this browser off when one does.
function watchSignIns(): void {
  if (getAuthMode() !== 'supabase') return;
  getBrowserClient().auth.onAuthStateChange((_event, session) => {
    if (isStaffOrTester(session?.user)) switchOff('account');
  });
}

// Reads and deletes the cookie the sign-in link route leaves when the link created the account, and counts it.
function consumeSignupCookie(): void {
  const found = document.cookie.split('; ').some((c) => c === `${SIGNUP_COOKIE}=1`);
  if (!found) return;
  document.cookie = `${SIGNUP_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  track('sign_up', { method: 'email_link' });
}

// Wraps fetch and sendBeacon (the two ways gtag.js sends) so every request to Google passes scrubHit first. This is the
// last wall: whatever Google's own tag adds (automatic link-click, download and history events, the real page address),
// only allowed events with clean fields leave the browser. Requests to anyone else pass through untouched. A request
// to Google whose body can't be read as text is dropped.
function installHitFilter(): void {
  const w = window as AnalyticsWindow;
  if (w.__btxAnalyticsGuard) return;
  w.__btxAnalyticsGuard = true;
  const origin = window.location.origin;

  // The cleaned request, or null to drop it. While switched off, every Google request is dropped.
  const filter = (url: string, body: unknown): { url: string; body: string | null } | null => {
    if (state.off) return null;
    if (body !== undefined && body !== null && typeof body !== 'string') return null;
    return scrubHit(url, body as string | null | undefined, origin);
  };
  // True when the address is Google's (scrubHit leaves everything else as it was).
  const isGoogle = (url: string): boolean => {
    try {
      return /(^|\.)(google-analytics\.com|analytics\.google\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com|google\.[a-z.]+)$/i.test(
        new URL(url, origin).hostname,
      );
    } catch {
      return false;
    }
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isGoogle(url)) return realFetch(input, init);
    // a Request object carries its own body we can't read synchronously: drop it
    if (typeof input !== 'string' && !(input instanceof URL)) return Promise.resolve(new Response(null, { status: 204 }));
    try {
      const out = filter(url, init?.body);
      if (!out) return Promise.resolve(new Response(null, { status: 204 }));
      return realFetch(out.url, { ...init, body: out.body ?? undefined });
    } catch {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  };

  if (typeof navigator.sendBeacon === 'function') {
    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
      const href = typeof url === 'string' ? url : url.href;
      if (!isGoogle(href)) return realBeacon(url, data);
      try {
        const out = filter(href, data);
        // report success for a dropped hit, so the tag does not retry it another way
        return out ? realBeacon(out.url, out.body ?? undefined) : true;
      } catch {
        return true;
      }
    };
  }
}

// Loads gtag.js with Consent Mode (analytics only, every ad signal denied), Google signals and ad personalization off,
// no automatic page view (pageView() sends clean ones), and cross-domain measurement with the website.
function loadTag(id: string): void {
  installHitFilter();
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('js', new Date());
  gtag('config', id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // the live site is https only; the Secure flag is left off on plain http (the e2e run), where the tag could not
    // store its visitor cookie and would send nothing
    cookie_flags: window.location.protocol === 'https:' ? 'SameSite=Lax;Secure' : 'SameSite=Lax',
    linker: { domains: [...LINKED_DOMAINS] },
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** Sets analytics up once per page load: decides whether the tag may load, loads it, then releases the queued sends
 *  (the first page view among them). Safe to call more than once. */
export async function startAnalytics(): Promise<void> {
  if (typeof window === 'undefined' || state.started) return;
  state.started = true;
  applySwitchFromAddress();
  state.off = state.off || readOff();

  const id = measurementId();
  const host = window.location.hostname.toLowerCase();
  // Global Privacy Control means "do not sell or share": the tag does not load and nothing is measured
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const account = state.off ? 'other' : await signedInAccount();
  if (account === 'staff') switchOff('account');
  // can't tell who is signed in: send nothing on this page, without switching the browser off for good
  if (account === 'unknown') state.off = true;
  watchSignIns();

  state.tag = !state.off && !gpc && id !== '' && host === PRODUCTION_HOST;
  if (state.tag) loadTag(id);

  state.ready = true;
  const queued = state.off ? [] : state.queue;
  state.queue = [];
  queued.forEach((send) => send());
  consumeSignupCookie();
}

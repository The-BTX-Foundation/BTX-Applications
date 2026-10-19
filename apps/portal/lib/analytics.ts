// Google Analytics 4 for the Portal: the rules. Which events may be sent, which parameters each may carry, what a page
// address looks like once cleaned, and the filter every Google hit passes through before it leaves the browser.
//
// Applicant data is T1 (students, some of them minors). No name, email, answer, file name, application id or user id,
// and no page address that carries one, may reach Google (security-playbook IN-51). Everything here is pure (no
// window, no React) so the unit tests can run it in Node. The browser side is lib/analytics-client.ts and
// app/Analytics.tsx. Owner notes: apps/portal/ANALYTICS.md.

/** The one host where the Google tag loads. Previews and local runs record events in dataLayer and send nothing. */
export const PRODUCTION_HOST = 'apply.thebtxfoundation.org';

// The website's GA4 measurement id (the WordPress option btx_ga_id on the website; property "The BTX Foundation",
// stream "BTX website", owned by info@thebtxfoundation.org). The website and the Portal share it, so one visit carries
// across both: the Portal is a subdomain, and the tag's visitor cookie sits on .thebtxfoundation.org for both sites.
// NEXT_PUBLIC_GA_ID overrides it (the end-to-end tests use a made-up one). '' turns analytics off everywhere.
const GA_ID = 'G-36BN7DJ7DN';

const ID_PATTERN = /^G-[A-Z0-9]{4,12}$/;

/** The short-lived cookie the sign-in link route (app/auth/callback) sets when the link created the account. It holds
 *  only "1"; the browser side counts one sign_up from it, then deletes it. On https it carries the __Host- prefix, so
 *  no other subdomain of thebtxfoundation.org can plant it; plain http (local runs, the e2e) can't use the prefix. */
export function signupCookieName(https: boolean): string {
  return https ? '__Host-btx-signup' : 'btx-signup';
}

// The measurement id, or '' when none is set. A badly formed id counts as none, so a typo never loads a broken tag.
export function measurementId(raw: string | undefined = process.env.NEXT_PUBLIC_GA_ID || GA_ID): string {
  const id = (raw ?? '').trim();
  return ID_PATTERN.test(id) ? id : '';
}

/* ---- page addresses ------------------------------------------------------------------------------------------- */

type Route = { title: string; group: string };

// Every page the Portal has, with a fixed title and a report group. A page address is reported only as one of these
// paths; anything else (a future page with an id in its path, a mistyped address) is reported as /other. Titles are
// fixed text, never the page's own title, so a future title with a name in it can't leak.
const ROUTES: Record<string, Route> = {
  '/': { title: 'The Legacy Scholarship', group: 'portal_landing' },
  '/sign-in': { title: 'Sign in', group: 'portal_sign_in' },
  '/sign-out': { title: 'Sign out', group: 'portal_sign_in' },
  '/apply/start': { title: 'Opening your application', group: 'portal_apply' },
  '/apply/basic-info': { title: 'Basic info', group: 'portal_apply' },
  '/apply/scholarship': { title: "This fall's scholarship", group: 'portal_apply' },
  '/apply/short-answers': { title: 'Short answers', group: 'portal_apply' },
  '/apply/essay': { title: 'Short answers', group: 'portal_apply' },
  '/apply/documents': { title: 'Documents', group: 'portal_apply' },
  '/apply/review': { title: 'Review and submit', group: 'portal_apply' },
  '/status': { title: 'Application submitted', group: 'portal_status' },
  '/status/schedule': { title: 'Schedule your interview', group: 'portal_status' },
  '/status/change': { title: 'Change your time', group: 'portal_status' },
  '/status/no-time': { title: 'Tell us when you’re free', group: 'portal_status' },
  '/status/story': { title: 'Your photo and story', group: 'portal_status' },
};
const OTHER = '/other';
const OTHER_ROUTE: Route = { title: 'Other page', group: 'portal_other' };

/** The five application steps in order, as reported (step_name). Matches STEP_PATHS in lib/steps.ts. */
export const STEP_KEYS = ['basic_info', 'scholarship', 'short_answers', 'documents', 'review'] as const;
const STEP_ROUTES = ['/apply/basic-info', '/apply/scholarship', '/apply/short-answers', '/apply/documents', '/apply/review'];

// Campaign tags BTX puts on its own links (newsletter, Instagram). Only source, medium and campaign are kept:
// utm_content and utm_term are where email tools put per-recipient ids. Source and medium must be one of BTX's own
// values (Btx-Website docs/ANALYTICS.md section 7). A campaign is kept only when it is short lowercase words, numbers
// and hyphens, like "fall-2026-legacy" or "2026-11", with no part shaped like an id.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const UTM_SOURCES = ['instagram', 'newsletter', 'linkedin', 'facebook', 'tiktok', 'youtube', 'board', 'website', 'email', 'umd', 'flyer', 'qr'];
const UTM_MEDIUMS = ['social', 'email', 'referral', 'print', 'qr', 'website', 'organic'];
const UTM_VALUE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// True when a campaign value has a part that looks like an id: six or more digits in a row, a hex string of eight or
// more with both letters and digits, or any part of 16 characters or more.
function looksLikeId(value: string): boolean {
  return value
    .split(/[-_]/)
    .some((part) => /\d{6,}/.test(part) || (/^[a-f0-9]{8,}$/.test(part) && /\d/.test(part) && /[a-f]/.test(part)) || part.length >= 16);
}

// The reported path for a pathname: an exact known route, or /other.
export function cleanPath(pathname: string): string {
  // "/apply/review/" and "/apply/review" are the same page
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return Object.prototype.hasOwnProperty.call(ROUTES, p) ? p : OTHER;
}

// The fixed title and report group for a reported path.
export function routeInfo(path: string): Route {
  return ROUTES[path] ?? OTHER_ROUTE;
}

// A page address as Google may see it: the origin, a known path, and only well-formed campaign tags. Every other query
// parameter (next=, error=, demo=, _gl=, anything future) and the #fragment are dropped. Returns '' for a value that
// is not an absolute address.
export function cleanLocation(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  const kept = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = (url.searchParams.get(key) ?? '').toLowerCase();
    const allowed =
      key === 'utm_source' ? UTM_SOURCES.includes(value) : key === 'utm_medium' ? UTM_MEDIUMS.includes(value) : UTM_VALUE.test(value) && !looksLikeId(value);
    if (allowed) kept.set(key, value);
  }
  const query = kept.toString();
  return `${url.origin}${cleanPath(url.pathname)}${query ? `?${query}` : ''}`;
}

// The referrer as Google may see it: a Portal page is cleaned like a page address; any other site is cut to its
// origin (the website, a mail app, a search engine), so a path or query from another site never passes through.
export function cleanReferrer(referrer: string, selfOrigin: string): string {
  if (!referrer) return '';
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  return url.origin === selfOrigin ? cleanLocation(referrer) : `${url.origin}/`;
}

// The step number (1 to 5) for a reported path, or 0 when the page is not an application step.
export function stepNumber(path: string): number {
  return STEP_ROUTES.indexOf(path) + 1;
}

/* ---- events and parameters -------------------------------------------------------------------------------------- */

/** Why a sign-in did not go through, as a fixed code. Never the address or the code she typed. */
export const SIGN_IN_ERRORS = [
  'email_missing', // the address field was empty
  'email_not_terpmail', // the address is not a Terpmail address
  'send_rate_limited', // too many codes asked for
  'send_failed', // the code email could not be sent
  'code_incomplete', // fewer than six digits
  'code_wrong', // the code did not match
  'code_expired', // the code was too old
  'verify_failed', // the check itself failed (network)
  'link_failed', // the email link had expired or was already used
  'terpmail_refused', // the database refused a non-Terpmail account
] as const;

// A parameter rule: a list of allowed text values, or a whole-number range.
type Rule = readonly string[] | { min: number; max: number };

// The allow-list of our own events and, for each, the only parameters it may carry and their allowed values.
const OWN_EVENTS: Record<string, Record<string, Rule>> = {
  sign_up: { method: ['email_code', 'email_link'] },
  sign_in_error: { code: SIGN_IN_ERRORS },
  application_begin: {},
  application_step: { step_number: { min: 1, max: 5 }, step_name: STEP_KEYS },
  application_submit: {},
};

/** The mark on the Portal's own page views (lib/analytics-client.ts pageView()). The filter lets a page view through
 *  only with this mark, then removes it: the tag's own history-change page views are dropped, so a screen is never
 *  counted twice and never with its real address, whatever the shared data stream's settings say. */
export const PAGE_VIEW_MARK = 'btx_page_view';

// Google's own events the filter lets through: the page view we send ourselves, and the engagement pings the tag sends
// on its own. Every other automatic event (outbound click, file download, form start, site search, video) is dropped,
// because those carry link addresses, file names and form addresses.
const GOOGLE_EVENTS: Record<string, Record<string, Rule>> = {
  page_view: {},
  user_engagement: {},
  scroll: { percent_scrolled: { min: 0, max: 100 } },
  session_start: {},
  first_visit: {},
};

// Parameters any event may carry: the report group set on every page, and Google's flag that a visit continued
// from another of the property's own domains (set when the stream lists both domains).
const ANY_EVENT: Record<string, Rule> = {
  content_group: [...new Set(Object.values(ROUTES).map((r) => r.group)), OTHER_ROUTE.group],
  ignore_referrer: ['true'],
};

/** Parameter names that could carry something an applicant typed or an id. Dropped first, before the allow-list, even
 *  if some future code passes them (a second wall, matching the website's deny-list). */
export const DENIED_PARAMS = [
  'q', 's', 'query', 'question', 'term', 'search_term', 'text', 'body', 'message',
  'email', 'name', 'full_name', 'first_name', 'last_name', 'phone', 'address', 'company', 'website',
  'answer', 'answers', 'essay', 'major', 'race', 'gender',
  'id', 'uid', 'user', 'user_id', 'application_id', 'app_id', 'slot_id', 'file', 'file_name', 'path',
  'url', 'link_url', 'link_text', 'page_location', 'page_path', 'page_referrer', 'page_title',
] as const;

/** Every event name that may reach Google. */
export const ALLOWED_EVENTS = [...Object.keys(OWN_EVENTS), ...Object.keys(GOOGLE_EVENTS)];

export type ParamValue = string | number;

// True when a value passes a rule. Text is compared exactly; numbers must be whole and inside the range.
function passes(rule: Rule, value: unknown): boolean {
  if (Array.isArray(rule)) return typeof value === 'string' && rule.includes(value);
  const range = rule as { min: number; max: number };
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= range.min && n <= range.max;
}

// The rules for one event name, or null when the event is not on the allow-list.
function rulesFor(event: string, ownOnly: boolean): Record<string, Rule> | null {
  if (Object.prototype.hasOwnProperty.call(OWN_EVENTS, event)) return { ...ANY_EVENT, ...OWN_EVENTS[event] };
  if (!ownOnly && Object.prototype.hasOwnProperty.call(GOOGLE_EVENTS, event)) return { ...ANY_EVENT, ...GOOGLE_EVENTS[event] };
  return null;
}

// Our own events: returns the parameters that may be sent, or null when the event itself is not allowed. Denied names
// go first, then anything not on the event's list, then any value outside its rule. Numbers stay numbers.
export function cleanParams(event: string, params: Record<string, unknown> = {}): Record<string, ParamValue> | null {
  const rules = rulesFor(event, true);
  if (!rules) return null;
  const out: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if ((DENIED_PARAMS as readonly string[]).includes(key)) continue;
    const rule = rules[key];
    if (!rule || !passes(rule, value)) continue;
    out[key] = Array.isArray(rule) ? String(value) : Number(value);
  }
  return out;
}

/* ---- the filter on every hit ------------------------------------------------------------------------------------ */

/** What the filter does with a request: leave it alone (not Google), rebuild it (a GA4 hit), allow only the tag script
 *  (the tag's own host), or drop it (every other Google measurement or advertising host). */
export type HitKind = 'other' | 'analytics' | 'tag' | 'blocked';

// Sorts a request address by where it goes. A trailing dot on the host ("www.google.com.") is the same host.
// analytics.google.com is blocked as well: requests there would carry the student's Google account cookies.
export function hitKind(rawUrl: string, base: string): HitKind {
  let host: string;
  try {
    host = new URL(rawUrl, base).hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    return 'other';
  }
  if (/(^|\.)google-analytics\.com$/.test(host)) return 'analytics';
  if (/(^|\.)googletagmanager\.com$/.test(host)) return 'tag';
  if (/(^|\.)(analytics\.google\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com)$/.test(host)) return 'blocked';
  // google.com and the country sites (www.google.co.uk); other google.com services (docs, meet) are not measurement
  if (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return 'blocked';
  return 'other';
}

// The GA4 hit fields that carry only technical values: protocol and tag ids, consent state, visitor and session
// counters, timing, screen size, language and browser brand. Every hit is REBUILT from these, the three page fields
// (dl, dr, dt, always rewritten) and the event parameters its rules allow. Anything else is dropped, whatever a future
// tag version or a data stream setting adds (for example `em`, hashed user-provided data, or `uid`).
const HIT_FIELDS = new Set([
  'v', 'tid', 'gtm', 'tag_exp', '_p', 'gcs', 'gcd', 'npa', 'dma', 'dma_cps', 'pscdl', 'are', 'frm', 'cid', 'ul', 'sr',
  'uaa', 'uab', 'uafvl', 'uamb', 'uam', 'uap', 'uapv', 'uaw', '_s', 'sid', 'sct', 'seg', '_et', '_ee', '_eu', '_c',
  '_fv', '_ss', '_nsi', '_tu', 'tfd', 'ngs', 'gaf', 'rcb', 'ae', 'richsstsse', '_dbg', 'ir', '_z', 'en',
]);
// A technical field's value may not hold an address, a path or an email address.
const SAFE_VALUE = /^[^@/\\]{0,300}$/;

// Rebuilds one set of hit fields (the shared part in the address, or one event line in the body) from the allow-lists
// above. Only the first value of a repeated field counts, and a field set may name one event at most. Fields with no
// event name may carry only the parameters every event may carry. `pageDl` is the hit's page address, used for the
// title when these fields carry a title but no address. Returns null when the event is not allowed.
function rebuildFields(fields: URLSearchParams, selfOrigin: string, pageDl: string | null): URLSearchParams | null {
  const names = fields.getAll('en');
  if (names.length > 1) return null;
  const event = names[0] ?? null;
  const rules = event === null ? ANY_EVENT : rulesFor(event, false);
  if (!rules) return null;
  // only the Portal's own page views (see PAGE_VIEW_MARK); the mark has no rule, so it is not copied
  if (event === 'page_view' && fields.get(`ep.${PAGE_VIEW_MARK}`) !== '1') return null;
  const out = new URLSearchParams();
  for (const [key, value] of fields) {
    if (out.has(key)) continue;
    if (key === 'dl') {
      out.set(key, cleanLocation(value));
    } else if (key === 'dr') {
      out.set(key, cleanReferrer(value, selfOrigin));
    } else if (key === 'dt') {
      // the title is looked up from the cleaned page address, never taken from the page
      out.set(key, routeInfo(pathOf(fields.get('dl') ?? pageDl)).title);
    } else if (key.startsWith('ep.') || key.startsWith('epn.')) {
      const name = key.slice(key.indexOf('.') + 1);
      const rule = rules[name];
      if (!(DENIED_PARAMS as readonly string[]).includes(name) && rule && passes(rule, value)) out.set(key, value);
    } else if (HIT_FIELDS.has(key) && SAFE_VALUE.test(value)) {
      out.set(key, value);
    }
  }
  return out;
}

// The reported path of a page address (raw or already cleaned), or /other when there is none.
function pathOf(href: string | null): string {
  const clean = href ? cleanLocation(href) : '';
  return clean ? new URL(clean).pathname : OTHER;
}

// The tag's own host may serve the tag script and nothing else: /gtag/js (and /gtag/destination, which the script
// may load), with only its id and loader fields, and no body. Diagnostics pings and frames there are dropped.
const TAG_PATHS = ['/gtag/js', '/gtag/destination'];
const TAG_FIELDS = ['id', 'l', 'cx', 'gtm', 'tag_exp'];

// The tag-host request rebuilt from those fields, or null to drop it.
function tagRequest(url: URL, body: string | null | undefined): { url: string; body: string | null } | null {
  if (body || !TAG_PATHS.includes(url.pathname)) return null;
  const out = new URLSearchParams();
  for (const key of TAG_FIELDS) {
    const value = url.searchParams.get(key);
    if (value !== null && SAFE_VALUE.test(value)) out.set(key, value);
  }
  url.search = out.toString();
  url.hash = '';
  return { url: url.toString(), body: null };
}

// The filter for one request to Google. Returns the rebuilt address and body, or null to drop the request.
// A GA4 hit names one event in its address, or carries a batch with one event per body line and the shared fields in
// the address. Events not on the allow-list are removed; a hit left with no event is dropped. Callers drop a request
// whose body can't be read as text (fail closed).
export function scrubHit(
  rawUrl: string,
  body: string | null | undefined,
  selfOrigin: string,
): { url: string; body: string | null } | null {
  const kind = hitKind(rawUrl, selfOrigin);
  if (kind === 'other') return { url: rawUrl, body: body ?? null };
  if (kind === 'blocked') return null;
  let url: URL;
  try {
    url = new URL(rawUrl, selfOrigin);
  } catch {
    return null;
  }
  if (kind === 'tag') return tagRequest(url, body);

  const pageDl = url.searchParams.get('dl');
  let shared = rebuildFields(url.searchParams, selfOrigin, pageDl);
  let sharedEvent = shared !== null && shared.has('en');
  if (!shared) {
    // the event named in the address is not allowed: keep the technical and page fields, without the event and its
    // parameters, so allowed events in the body can still go
    const stripped = new URLSearchParams([...url.searchParams].filter(([k]) => k !== 'en' && !k.startsWith('ep.') && !k.startsWith('epn.')));
    shared = rebuildFields(stripped, selfOrigin, pageDl);
    sharedEvent = false;
  }
  if (!shared) return null;

  const lines: string[] = [];
  const separator = body && body.includes('\r\n') ? '\r\n' : '\n';
  for (const line of (body ?? '').split(/\r?\n/)) {
    if (!line) continue;
    const fields = new URLSearchParams(line);
    // a body line must name exactly one event; anything else is not a format we know
    if (fields.getAll('en').length !== 1) continue;
    const clean = rebuildFields(fields, selfOrigin, pageDl);
    if (clean) lines.push(clean.toString());
  }

  // an analytics hit left with no allowed event is not sent at all
  if (!sharedEvent && lines.length === 0) return null;
  url.search = shared.toString();
  url.hash = '';
  return { url: url.toString(), body: lines.length ? lines.join(separator) : null };
}

/* ---- who is measured -------------------------------------------------------------------------------------------- */

/** The staff roles (the Ops Hub's apps/ops/lib/role.ts). A signed-in staff account sends nothing. */
export const STAFF_ROLES = ['admin', 'board'] as const;

type AccountLike = { email?: string | null; app_metadata?: Record<string, unknown> | null } | null | undefined;

// True when the signed-in account belongs to staff or a tester: a staff role (set by admins in app_metadata, which
// the account itself can't change), or any address that is not a Terpmail address. Only Terpmail addresses and the
// preview/test allow-list can sign in, so a non-Terpmail account is a board member testing.
export function isStaffOrTester(account: AccountLike): boolean {
  if (!account) return false;
  const role = account.app_metadata?.role;
  if (typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role)) return true;
  const email = (account.email ?? '').trim().toLowerCase();
  return email !== '' && !/^[^\s@]+@terpmail\.umd\.edu$/.test(email);
}

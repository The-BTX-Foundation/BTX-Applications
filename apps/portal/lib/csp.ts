// The Portal's Content-Security-Policy, sent as Report-Only during the trial: the browser blocks nothing, but reports
// every load the policy would refuse to /api/csp-report. It is the browser-enforced backstop behind the analytics hit
// filter (lib/analytics-client.ts): once enforced, a page can load scripts, open connections, show images and embed
// frames only from the origins listed here. Owner notes: apps/portal/CSP.md.
//
// Everything here is pure (no request, no window) so the unit tests can run it. proxy.ts builds the header per request
// with a fresh nonce; Next.js reads that nonce from the request header and puts it on its own inline scripts.
import { cleanPath } from './analytics';

/** Where browsers send violation reports (app/api/csp-report/route.ts), through the policy's report-uri. The newer
 *  report-to is left out on purpose: Chrome then sends through the Reporting API instead, which batches reports and,
 *  in testing, never delivered them from a headless browser, while every browser sends report-uri reports at once. */
export const REPORT_PATH = '/api/csp-report';

// The review tool's host (app/RaykenReview.tsx); its loader runs only on the review preview build.
const REVIEW_ORIGIN = 'https://review.raykendigital.com';

export type CspOptions = {
  /** This request's nonce: Next.js's inline scripts (and the review loader) carry it. */
  nonce: string;
  /** The Supabase project address (NEXT_PUBLIC_SUPABASE_URL); '' in mock mode. */
  supabaseUrl: string;
  /** `next dev`: React needs eval for its error overlays, and the dev server's hot reload uses a websocket. */
  dev: boolean;
  /** A Vercel preview deployment: Vercel's toolbar (vercel.live) loads there. */
  vercelPreview: boolean;
  /** The review build (NEXT_PUBLIC_RAYKEN_REVIEW=1): the review tool's widget loads there. */
  review: boolean;
};

// The origin of an address, or '' when it is empty or not an http(s) address.
function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : '';
  } catch {
    return '';
  }
}

// The policy text: one directive per kind of load, each an allow-list. Script sources are this site (the app's own
// chunks), this request's nonce (Next.js's inline bootstrap) and Google's tag script, by path (/gtag/ only, so a
// Tag Manager container such as gtm.js?id=GTM-... is not allowed); no 'unsafe-inline' and no 'strict-dynamic', so a
// script from any other host is reported. Styles keep 'unsafe-inline' (React style attributes
// and Next's font styles), which carries far less risk than inline script. A nonce is never put in style-src, because
// browsers then ignore 'unsafe-inline' there.
export function buildCsp(o: CspOptions): string {
  const supabase = originOf(o.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, 'ws') : '';
  const review = o.review ? [REVIEW_ORIGIN] : [];
  const vercel = o.vercelPreview ? ['https://vercel.live'] : [];

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${o.nonce}'`, 'https://www.googletagmanager.com/gtag/', ...review, ...vercel, ...(o.dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'", ...review, ...vercel]],
    ['img-src', ["'self'", 'data:', 'blob:', supabase, ...review, ...vercel, ...(o.vercelPreview ? ['https://vercel.com'] : [])]],
    ['font-src', ["'self'", 'data:', ...review, ...(o.vercelPreview ? ['https://vercel.live', 'https://assets.vercel.com'] : [])]],
    [
      'connect-src',
      [
        "'self'",
        supabase,
        supabaseWs,
        'https://*.google-analytics.com',
        ...review,
        ...vercel,
        ...(o.vercelPreview ? ['wss://ws-us3.pusher.com'] : []),
        ...(o.dev ? ['ws:', 'wss:'] : []),
      ],
    ],
    ['frame-src', ["'self'", ...review, ...vercel]],
    ['worker-src', ["'self'"]],
    ['media-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
    ['report-uri', [REPORT_PATH]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.filter(Boolean).join(' ')}`).join('; ');
}

/** The nonce in a policy's script-src (or default-src), the same rule Next.js uses to find the one it stamps on its own
 *  inline scripts (next/dist/server/app-render/get-script-nonce-from-header.js), or undefined. */
export function nonceFromPolicy(policy: string | null | undefined): string | undefined {
  const directives = (policy ?? '').split(';').map((d) => d.trim());
  const directive = directives.find((d) => d.startsWith('script-src')) ?? directives.find((d) => d.startsWith('default-src'));
  for (const source of (directive ?? '').split(/\s+/).slice(1)) {
    const match = source.match(/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/);
    if (match) return match[1];
  }
  return undefined;
}

/** A random nonce for one response: 16 bytes, base64 (the form Next.js accepts). */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/** The Portal's own addresses, for reading reports: the production host, this Vercel deployment's addresses, and the
 *  address the request came in on. Off Vercel, Next.js reports every request as localhost, so a fixed list is needed. */
export function portalOrigins(requestOrigin: string, env: Record<string, string | undefined>): string[] {
  const hosts = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter((h): h is string => Boolean(h));
  return [...new Set([requestOrigin, 'https://apply.thebtxfoundation.org', ...hosts.map((h) => `https://${h}`)])];
}

/* ---- reading violation reports ----------------------------------------------------------------------------------- */

/** One violation as it is logged: the directive, where the blocked load pointed (an origin or a keyword), the Portal
 *  page it happened on (a known route or /other), the script that caused it (an origin, or a Next.js chunk path) and
 *  its line. Nothing else from the report is kept: page addresses can carry query strings, blocked addresses can be
 *  signed storage links with tokens, and the sample can be page text. */
export type CspViolation = { directive: string; blocked: string; page: string; source: string; line: number; disposition: string };

const KEYWORDS = ['inline', 'eval', 'wasm-eval', 'data', 'blob', 'self', 'trusted-types-policy', 'trusted-types-sink'];

// Browser-extension schemes: a report from an extension's own script is logged as its scheme, never its id.
const EXTENSION_SCHEME = /^(chrome-extension|moz-extension|safari-web-extension|safari-extension):/i;

// Where a blocked load pointed: a keyword the browser uses ('inline', 'eval', ...), a scheme (data, blob, an
// extension), or just the origin of an address.
function blockedOf(value: unknown, selfOrigins: string[]): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (KEYWORDS.includes(v)) return v;
  const scheme = v.match(/^(data|blob):/i) ?? v.match(EXTENSION_SCHEME);
  if (scheme) return scheme[1].toLowerCase();
  const ws = /^wss?:/i.test(v);
  const origin = originOf(ws ? v.replace(/^ws/i, 'http') : v);
  if (!origin) return v ? 'other' : 'none';
  if (selfOrigins.includes(origin)) return 'self';
  return ws ? origin.replace(/^http/, 'ws') : origin;
}

// The Portal page a report came from, as a known route (lib/analytics.ts cleanPath), or 'other-origin'.
function pageOf(value: unknown, selfOrigins: string[]): string {
  try {
    const u = new URL(String(value));
    return selfOrigins.includes(u.origin) ? cleanPath(u.pathname) : 'other-origin';
  } catch {
    return 'none';
  }
}

// The script that caused the violation: a Next.js chunk path on this site, 'self' for any other path here, an
// extension's scheme, or another site's origin.
function sourceOf(value: unknown, selfOrigins: string[]): string {
  const text = String(value ?? '');
  const extension = text.match(EXTENSION_SCHEME);
  if (extension) return extension[1].toLowerCase();
  try {
    const u = new URL(text);
    if (!selfOrigins.includes(u.origin)) return u.origin;
    return /^\/_next\/static\/[\w./-]{1,160}$/.test(u.pathname) ? u.pathname : 'self';
  } catch {
    return 'none';
  }
}

/** The violations in a report body, cleaned (see CspViolation); at most 20 per body. Handles both formats browsers
 *  send: report-uri's {"csp-report": {...}} and the Reporting API's [{type: "csp-violation", body: {...}}].
 *  `selfOrigins` are the Portal's own addresses (portalOrigins), so a Portal page is logged as its route. */
export function readViolations(body: unknown, selfOrigins: string[]): CspViolation[] {
  const raw: Array<Record<string, unknown>> = [];
  if (Array.isArray(body)) {
    for (const item of body) {
      if (item && typeof item === 'object' && (item as { type?: unknown }).type === 'csp-violation') {
        const inner = (item as { body?: unknown }).body;
        if (inner && typeof inner === 'object') {
          const b = inner as Record<string, unknown>;
          raw.push({
            directive: b.effectiveDirective,
            blocked: b.blockedURL,
            page: b.documentURL,
            source: b.sourceFile,
            line: b.lineNumber,
            disposition: b.disposition,
          });
        }
      }
    }
  } else if (body && typeof body === 'object' && 'csp-report' in body) {
    const r = (body as Record<string, unknown>)['csp-report'];
    if (r && typeof r === 'object') {
      const b = r as Record<string, unknown>;
      raw.push({
        directive: b['effective-directive'] ?? String(b['violated-directive'] ?? '').split(' ')[0],
        blocked: b['blocked-uri'],
        page: b['document-uri'],
        source: b['source-file'],
        line: b['line-number'],
        disposition: b.disposition,
      });
    }
  }
  return raw.slice(0, 20).map((r) => ({
    directive: typeof r.directive === 'string' && /^[a-z-]{1,40}$/.test(r.directive) ? r.directive : 'unknown',
    blocked: blockedOf(r.blocked, selfOrigins),
    page: pageOf(r.page, selfOrigins),
    source: sourceOf(r.source, selfOrigins),
    line: typeof r.line === 'number' && Number.isInteger(r.line) && r.line >= 0 && r.line < 1e7 ? r.line : 0,
    disposition: r.disposition === 'enforce' ? 'enforce' : 'report',
  }));
}

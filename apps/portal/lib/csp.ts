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
// chunks), this request's nonce (Next.js's inline bootstrap) and Google's tag script; no 'unsafe-inline' and no
// 'strict-dynamic', so a script from any other host is reported. Styles keep 'unsafe-inline' (React style attributes
// and Next's font styles), which carries far less risk than inline script. A nonce is never put in style-src, because
// browsers then ignore 'unsafe-inline' there.
export function buildCsp(o: CspOptions): string {
  const supabase = originOf(o.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, 'ws') : '';
  const review = o.review ? [REVIEW_ORIGIN] : [];
  const vercel = o.vercelPreview ? ['https://vercel.live'] : [];

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${o.nonce}'`, 'https://www.googletagmanager.com', ...review, ...vercel, ...(o.dev ? ["'unsafe-eval'"] : [])]],
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

/** A random nonce for one response: 16 bytes, base64 (the form Next.js accepts). */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/* ---- reading violation reports ----------------------------------------------------------------------------------- */

/** One violation as it is logged: the directive, where the blocked load pointed (an origin or a keyword), the Portal
 *  page it happened on (a known route or /other), the script that caused it (an origin, or a Next.js chunk path) and
 *  its line. Nothing else from the report is kept: page addresses can carry query strings, blocked addresses can be
 *  signed storage links with tokens, and the sample can be page text. */
export type CspViolation = { directive: string; blocked: string; page: string; source: string; line: number; disposition: string };

const KEYWORDS = ['inline', 'eval', 'wasm-eval', 'data', 'blob', 'self', 'trusted-types-policy', 'trusted-types-sink'];

// Where a blocked load pointed: a keyword the browser uses ('inline', 'eval', ...), or just the origin of an address.
function blockedOf(value: unknown, selfOrigin: string): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (KEYWORDS.includes(v)) return v;
  if (/^(data|blob):/.test(v)) return v.slice(0, v.indexOf(':'));
  const origin = originOf(v.replace(/^ws/, 'http'));
  if (!origin) return v ? 'other' : 'none';
  if (origin === selfOrigin) return 'self';
  return v.startsWith('ws') ? origin.replace(/^http/, 'ws') : origin;
}

// The Portal page a report came from, as a known route (lib/analytics.ts cleanPath), or 'other-origin'.
function pageOf(value: unknown, selfOrigin: string): string {
  try {
    const u = new URL(String(value));
    return u.origin === selfOrigin ? cleanPath(u.pathname) : 'other-origin';
  } catch {
    return 'none';
  }
}

// The script that caused the violation: a Next.js chunk path on this site, 'self' for any other path here, or an origin.
function sourceOf(value: unknown, selfOrigin: string): string {
  try {
    const u = new URL(String(value));
    if (u.origin !== selfOrigin) return u.origin;
    return /^\/_next\/static\/[\w./-]{1,160}$/.test(u.pathname) ? u.pathname : 'self';
  } catch {
    return 'none';
  }
}

/** The violations in a report body, cleaned (see CspViolation); at most 20 per body. Handles both formats browsers
 *  send: report-uri's {"csp-report": {...}} and the Reporting API's [{type: "csp-violation", body: {...}}]. */
export function readViolations(body: unknown, selfOrigin: string): CspViolation[] {
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
    blocked: blockedOf(r.blocked, selfOrigin),
    page: pageOf(r.page, selfOrigin),
    source: sourceOf(r.source, selfOrigin),
    line: typeof r.line === 'number' && Number.isInteger(r.line) && r.line >= 0 && r.line < 1e7 ? r.line : 0,
    disposition: r.disposition === 'enforce' ? 'enforce' : 'report',
  }));
}

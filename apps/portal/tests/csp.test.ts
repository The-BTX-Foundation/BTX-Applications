// The Content-Security-Policy trial (lib/csp.ts): the policy text per environment, the nonce, and how violation reports
// are cleaned before they are logged. The browser check is e2e/csp.spec.ts.
import { describe, expect, it } from 'vitest';
import { buildCsp, makeNonce, readViolations } from '@/lib/csp';

const ORIGIN = 'https://apply.thebtxfoundation.org';
const SUPABASE = 'https://awiaebtqalcmfafvktwh.supabase.co';
const base = { nonce: 'n0nce+/=', supabaseUrl: SUPABASE, dev: false, vercelPreview: false, review: false };

// The sources of one directive in a policy.
const sources = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

describe('buildCsp', () => {
  it('production: nonce and listed hosts only, no inline or eval script', () => {
    const p = buildCsp(base);
    expect(sources(p, 'script-src')).toEqual(["'self'", "'nonce-n0nce+/='", 'https://www.googletagmanager.com']);
    expect(sources(p, 'connect-src')).toEqual(["'self'", SUPABASE, 'wss://awiaebtqalcmfafvktwh.supabase.co', 'https://*.google-analytics.com']);
    expect(sources(p, 'img-src')).toEqual(["'self'", 'data:', 'blob:', SUPABASE]);
    expect(sources(p, 'frame-src')).toEqual(["'self'"]);
    expect(sources(p, 'object-src')).toEqual(["'none'"]);
    expect(sources(p, 'report-uri')).toEqual(['/api/csp-report']);
    // no report-to: Chrome would then send through the batched Reporting API instead of report-uri
    expect(p).not.toContain('report-to');
    // style keeps 'unsafe-inline' and never a nonce (a nonce would switch 'unsafe-inline' off)
    expect(sources(p, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(p).not.toMatch(/unsafe-eval|strict-dynamic|vercel|raykendigital|ws: |wss: /);
    expect(p).not.toMatch(/ {2}|\s;/);
  });

  it('adds only what each other environment needs', () => {
    expect(sources(buildCsp({ ...base, dev: true }), 'script-src')).toContain("'unsafe-eval'");
    expect(sources(buildCsp({ ...base, dev: true }), 'connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:']));
    const preview = buildCsp({ ...base, vercelPreview: true });
    expect(sources(preview, 'script-src')).toContain('https://vercel.live');
    expect(sources(preview, 'connect-src')).toContain('wss://ws-us3.pusher.com');
    const review = buildCsp({ ...base, review: true });
    for (const d of ['script-src', 'connect-src', 'img-src', 'frame-src', 'style-src']) expect(sources(review, d)).toContain('https://review.raykendigital.com');
    // mock mode has no Supabase project
    const mock = buildCsp({ ...base, supabaseUrl: '' });
    expect(sources(mock, 'connect-src')).toEqual(["'self'", 'https://*.google-analytics.com']);
    expect(mock).not.toMatch(/ {2}|\s;/);
  });
});

describe('makeNonce', () => {
  it('is 16 random bytes in the base64 form Next.js accepts', () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
    expect(atob(a)).toHaveLength(16);
    expect(makeNonce()).not.toBe(a);
  });
});

describe('readViolations', () => {
  it('keeps only the directive, the blocked origin, the route, the causing chunk and the line (report-uri format)', () => {
    const report = {
      'csp-report': {
        'document-uri': `${ORIGIN}/status/interview/8f14e45f?email=jane%40terpmail.umd.edu`,
        referrer: `${ORIGIN}/sign-in?next=%2Fstatus`,
        'violated-directive': 'img-src',
        'effective-directive': 'img-src',
        'original-policy': "default-src 'self'",
        disposition: 'report',
        'blocked-uri': `${SUPABASE}/storage/v1/object/sign/photos/8f14e45f/me.jpg?token=eyJhbGciOi`,
        'line-number': 12,
        'source-file': `${ORIGIN}/_next/static/chunks/app/page-1a2b.js`,
        'script-sample': 'Jane Doe, 301-555-0199',
      },
    };
    expect(readViolations(report, ORIGIN)).toEqual([
      { directive: 'img-src', blocked: SUPABASE, page: '/other', source: '/_next/static/chunks/app/page-1a2b.js', line: 12, disposition: 'report' },
    ]);
  });

  it('reads the Reporting API format, keeps keywords, and ignores other report types', () => {
    const reports = [
      { type: 'deprecation', body: { message: 'x' } },
      {
        type: 'csp-violation',
        url: `${ORIGIN}/apply/review?demo=1`,
        body: { documentURL: `${ORIGIN}/apply/review?demo=1`, effectiveDirective: 'script-src-elem', blockedURL: 'inline', sourceFile: `${ORIGIN}/apply/review`, lineNumber: 3, disposition: 'report', sample: 'secret' },
      },
      {
        type: 'csp-violation',
        body: { documentURL: `${ORIGIN}/sign-in`, effectiveDirective: 'connect-src', blockedURL: 'wss://evil.example.com/socket?id=1', sourceFile: 'https://cdn.example.com/x.js?v=1' },
      },
    ];
    expect(readViolations(reports, ORIGIN)).toEqual([
      { directive: 'script-src-elem', blocked: 'inline', page: '/apply/review', source: 'self', line: 3, disposition: 'report' },
      { directive: 'connect-src', blocked: 'wss://evil.example.com', page: '/sign-in', source: 'https://cdn.example.com', line: 0, disposition: 'report' },
    ]);
  });

  it('never passes odd values through, and logs at most 20 violations per body', () => {
    const odd = { 'csp-report': { 'violated-directive': 'IMG SRC <x>', 'blocked-uri': 'javascript:alert(1)', 'document-uri': 'not a url', 'line-number': -1, disposition: 'nope' } };
    expect(readViolations(odd, ORIGIN)).toEqual([{ directive: 'unknown', blocked: 'other', page: 'none', source: 'none', line: 0, disposition: 'report' }]);
    const many = Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data' } }));
    expect(readViolations(many, ORIGIN)).toHaveLength(20);
    expect(readViolations('text', ORIGIN)).toEqual([]);
    expect(readViolations(null, ORIGIN)).toEqual([]);
  });
});

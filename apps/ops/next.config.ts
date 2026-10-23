import type { NextConfig } from 'next';

// The BTX Supabase project's address and publishable key. Both are public by design (they ship to every browser;
// the database's access rules protect the data). Vercel builds use them unless the project sets its own values;
// local runs keep the mock unless apps/ops/.env.local sets them.
const SUPABASE_URL = 'https://awiaebtqalcmfafvktwh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9K1-NijV5lSE_SoY-3_2Tg_bKYHQIuy';
const onVercel = process.env.VERCEL === '1';
// The sample-data copy for App Review (Vercel project btx-ops-demo) is built with BTX_FORCE_MOCK=1. That wins over everything:
// no database address or key is baked in, sign-in is the offline mock, and the pages show sample data with a banner.
// A stray space or "true" still counts: the cost of missing it is a demo that asks App Review for a code.
const forceMock = /^(1|true|yes)$/i.test((process.env.BTX_FORCE_MOCK ?? '').trim());

// Security headers sent on every route. The Content-Security-Policy is deliberately small (framing, base tag, plugins
// only); a full script/style/connect policy needs a Report-Only trial first. Same-origin framing stays allowed because
// the team checks phone width through a same-origin iframe.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // The pages say noindex in their markup; this covers the routes that return their own HTML or a PDF (the email preview, the sample file).
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
];

// The shared packages ship TypeScript source, so Next compiles them with the app.
const nextConfig: NextConfig = {
  // Stop `next dev` from writing an AGENTS.md into the app folder.
  agentRules: false,
  // Don't announce the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Apply the security headers to all routes.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The dev-mode badge would sit on top of the sidebar in screenshots.
  devIndicators: false,
  transpilePackages: ['@btx/ui', '@btx/data', '@btx/emails', '@btx/push', '@btx/ai'],
  env: forceMock
    ? {
        NEXT_PUBLIC_BTX_FORCE_MOCK: '1',
        NEXT_PUBLIC_AUTH_MODE: 'mock',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      }
    : onVercel
      ? {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY,
        }
      : {},
};

export default nextConfig;

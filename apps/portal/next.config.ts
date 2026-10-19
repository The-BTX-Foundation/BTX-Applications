import type { NextConfig } from 'next';

// The BTX Supabase project's address and publishable key. Both are public by design (they ship to every browser;
// the database's access rules protect the data). Vercel builds use them unless the project sets its own values;
// local runs keep the mock unless apps/portal/.env.local sets them.
const SUPABASE_URL = 'https://awiaebtqalcmfafvktwh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9K1-NijV5lSE_SoY-3_2Tg_bKYHQIuy';
const onVercel = process.env.VERCEL === '1';

// Security headers sent on every route. The Content-Security-Policy is deliberately small (framing, base tag, plugins
// only); a full script/style/connect policy needs a Report-Only trial first. Same-origin framing stays allowed because
// the team checks phone width through a same-origin iframe.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
];

// The shared packages ship TypeScript source, so Next compiles them with the app.
const nextConfig: NextConfig = {
  // Stop `next dev` from writing an AGENTS.md into the app folder.
  agentRules: false,
  // `next dev` only: e2e/analytics.spec.ts opens the dev server under the production name (the browser maps it to this
  // machine) so the analytics production-host rule runs as it will live. Without this the dev server refuses its own
  // scripts to that name. Production builds ignore the setting.
  allowedDevOrigins: ['apply.thebtxfoundation.org'],
  // Don't announce the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Apply the security headers to all routes.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  transpilePackages: ['@btx/ui', '@btx/data', '@btx/emails', '@btx/ai'],
  env: onVercel
    ? {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY,
      }
    : {},
};

export default nextConfig;

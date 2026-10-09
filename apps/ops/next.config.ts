import type { NextConfig } from 'next';

// The BTX Supabase project's address and publishable key. Both are public by design (they ship to every browser;
// the database's access rules protect the data). Vercel builds use them unless the project sets its own values;
// local runs keep the mock unless apps/ops/.env.local sets them.
const SUPABASE_URL = 'https://awiaebtqalcmfafvktwh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9K1-NijV5lSE_SoY-3_2Tg_bKYHQIuy';
const onVercel = process.env.VERCEL === '1';

// The shared packages ship TypeScript source, so Next compiles them with the app.
const nextConfig: NextConfig = {
  // Stop `next dev` from writing an AGENTS.md into the app folder.
  agentRules: false,
  // The dev-mode badge would sit on top of the sidebar in screenshots.
  devIndicators: false,
  transpilePackages: ['@btx/ui', '@btx/data'],
  env: onVercel
    ? {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY,
      }
    : {},
};

export default nextConfig;

import type { NextConfig } from 'next';

// The shared packages ship TypeScript source, so Next compiles them with the app.
const nextConfig: NextConfig = {
  // Stop `next dev` from writing an AGENTS.md into the app folder.
  agentRules: false,
  transpilePackages: ['@btx/ui', '@btx/data'],
};

export default nextConfig;

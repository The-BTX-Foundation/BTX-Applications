import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests: plain TypeScript modules, no browser. The "@" alias matches tsconfig.
// "server-only" throws when imported outside a React Server build, so tests load its empty stand-in (the same file
// Next.js uses on the server) and can import server-only modules such as lib/teams/.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname), 'server-only': path.resolve(__dirname, '../../node_modules/server-only/empty.js') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});

import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests: plain TypeScript modules, no browser. The "@" alias matches tsconfig.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});

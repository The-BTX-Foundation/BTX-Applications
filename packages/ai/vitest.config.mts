import { defineConfig } from 'vitest/config';

// Unit tests: plain TypeScript modules, no browser, no network (the model client is faked).
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});

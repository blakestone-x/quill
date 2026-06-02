import { defineConfig } from 'vitest/config';

// Pure-logic tests run under Node. Component/DOM tests can add environment:
// 'jsdom' later. Kept separate from electron.vite.config.ts on purpose.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts']
  }
});

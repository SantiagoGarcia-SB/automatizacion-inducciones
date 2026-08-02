import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec,property}.{js,mjs}'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    reporters: ['default'],
  },
});

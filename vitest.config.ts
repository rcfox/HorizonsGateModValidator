import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,        // Explicit imports (not global describe/test)
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['dist/**', 'test/**', '*.config.*', 'build-bundle.js', 'extract_schema.cjs'],
    },
  },
});

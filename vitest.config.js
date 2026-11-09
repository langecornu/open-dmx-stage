// Browser tests: Vitest with jsdom and React Testing Library. Server tests use node:test (see package.json).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/web/**/*.test.{js,jsx}'],
    setupFiles: ['tests/web/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      reporter: ['text-summary', 'lcov'],
      // A floor measured on the day it was set (statements 55.7%, branches 82%, functions 67%); raise it as tests are
      // added and never lower it. Untested files count against it because `include` lists every source file.
      thresholds: { lines: 50, statements: 50, functions: 60, branches: 75 },
    },
  },
});

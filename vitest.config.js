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
      // A floor measured on the day it was set (statements 97%, lines 97%, functions 97%, branches 89.5%), with a margin
      // of a few points for the line that is hard to cover. Vitest 5 counts the branches of files no test touches, so
      // this is an honest measure of every screen. Raise it as tests are added and never lower it. Untested files count
      // against it because `include` lists every source file; only the two-line entry point (main.jsx) is left out.
      exclude: ['src/main.jsx'],
      thresholds: { lines: 93, statements: 93, functions: 93, branches: 85 },
    },
  },
});

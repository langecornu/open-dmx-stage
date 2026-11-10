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
      // A floor measured on the day it was set, under Vitest 5 (statements and lines about 70%, functions about 70%,
      // branches 68%). Vitest 5 counts every branch in files no test touches (the Lights, Looks, Output, top bar and
      // navigation screens), which the older measurement did not, so the branch figure is honest rather than lower. Raise
      // it as tests are added and never lower it. Untested files count against it because `include` lists every source file.
      thresholds: { lines: 65, statements: 65, functions: 65, branches: 65 },
    },
  },
});

import { defineConfig } from 'vitest/config';

const ui = ['test/acceptance/OutputTabs.test.ts', 'test/unit/ui/**/*.test.{ts,tsx}'];
export default defineConfig({
  test: { projects: [
    { test: { name: 'core', include: ['test/{unit,acceptance}/**/*.test.{ts,tsx}'], exclude: ui } },
    { test: { name: 'ui', include: ui, globalSetup: ['test/driver/output-tabs-setup.ts'] } },
  ] },
});

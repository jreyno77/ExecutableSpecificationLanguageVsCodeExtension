import { defineConfig } from 'vitest/config';

const ui = ['test/acceptance/OutputTabs.test.ts', 'test/unit/ui/**/*.test.{ts,tsx}'];
export default defineConfig({
  test: { projects: [
    { test: { name: 'syntax', include: ['test/acceptance/native-editor.test.ts'], testTimeout: 90_000, maxWorkers: 1 } },
    { test: { name: 'core', include: ['test/{unit,acceptance}/**/*.test.{ts,tsx}'], exclude: [...ui, 'test/acceptance/workspace.test.ts', 'test/acceptance/EditorLanguageSupport.test.ts', 'test/acceptance/native-editor.test.ts', 'test/unit/vscode/diagnostic-middleware.test.ts'] } },
    { test: { name: 'ui', include: ui, globalSetup: ['test/driver/output-tabs-setup.ts'] } },
  ] },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sidebarUnit = 'test/unit/vscode/connection-sidebar.test.ts';
const ui = ['test/acceptance/OutputTabs.test.ts', 'test/unit/ui/**/*.test.{ts,tsx}'];
export default defineConfig({
  test: { projects: [
    { test: { name: 'syntax', include: ['test/acceptance/native-editor.test.ts'], testTimeout: 90_000, maxWorkers: 1 } },
    { test: { name: 'core', include: ['test/{unit,acceptance}/**/*.test.{ts,tsx}'], exclude: ['test/acceptance/GenerationHost.test.ts', 'test/acceptance/OutputPreviewHost.test.ts', sidebarUnit, 'test/acceptance/ConnectionSidebar.test.ts', ...ui, 'test/acceptance/workspace.test.ts', 'test/acceptance/EditorLanguageSupport.test.ts', 'test/acceptance/native-editor.test.ts', 'test/unit/vscode/diagnostic-middleware.test.ts'] } },
    { resolve: { alias: { vscode: fileURLToPath(new URL('./test/resources/vscode/recorded-sidebar-api.ts', import.meta.url)) } }, test: { name: 'connection-sidebar', include: [sidebarUnit] } },
    { test: { name: 'ui', include: ui, globalSetup: ['test/driver/output-tabs-setup.ts'] } },
  ] },
});

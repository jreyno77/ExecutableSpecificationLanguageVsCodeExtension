import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sidebarUnit = 'test/unit/vscode/connection-sidebar.test.ts';
const definitionMiddlewareUnit = 'test/unit/vscode/definition-middleware.test.ts';
const ui = ['test/acceptance/OutputTabs.test.ts', 'test/unit/ui/**/*.test.{ts,tsx}'];
const svg = ['test/acceptance/OutputPreviews.test.ts', 'test/unit/core/output-preview-failures.test.ts', 'test/unit/vscode/svg-labels.test.ts'];
export default defineConfig({
  test: { maxWorkers: 2, projects: [
    { test: { name: 'syntax', include: ['test/acceptance/native-editor.test.ts'], testTimeout: 90_000, maxWorkers: 1 } },
    { test: { name: 'core', include: ['test/{unit,acceptance}/**/*.test.{ts,tsx}'], exclude: ['test/acceptance/SourceDefinitionAdapter.test.ts', 'test/acceptance/GenerationHost.test.ts', 'test/acceptance/OutputPreviewHost.test.ts', sidebarUnit, definitionMiddlewareUnit, 'test/acceptance/ConnectionSidebar.test.ts', ...ui, ...svg, 'test/acceptance/workspace.test.ts', 'test/acceptance/EditorLanguageSupport.test.ts', 'test/acceptance/native-editor.test.ts', 'test/unit/vscode/diagnostic-middleware.test.ts'] } },
    { test: { name: 'svg', include: svg, globalSetup: ['test/driver/svg-browser-setup.ts'] } },
    { resolve: { alias: { vscode: fileURLToPath(new URL('./test/resources/vscode/recorded-sidebar-api.ts', import.meta.url)) } }, test: { name: 'connection-sidebar', include: [sidebarUnit] } },
    { resolve: { alias: { vscode: fileURLToPath(new URL('./test/resources/vscode/recorded-language-api.ts', import.meta.url)) } }, test: { name: 'language-support', include: [definitionMiddlewareUnit] } },
    { test: { name: 'ui', include: ui, globalSetup: ['test/driver/output-tabs-setup.ts'] } },
  ] },
});

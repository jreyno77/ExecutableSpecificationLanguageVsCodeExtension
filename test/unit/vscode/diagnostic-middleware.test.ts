import { expect, test } from 'vitest';
import { InstalledExpecEditor } from '../../driver/vscode/installed-extension.js';

test('a missing native document cancels a diagnostic pull before delegating', async () => {
  const editor = await InstalledExpecEditor.prepare();
  const { runtime, ...actual } = await editor.missingDocumentDiagnostics();
  console.info('Native diagnostic middleware runtime: ' + JSON.stringify(runtime));
  expect(actual).toEqual({ cancellationError: true, nextCalls: 0 });
});

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileSources } from '../../../src/vscode/FileSources.js';
import { describe, expect, it } from 'vitest';
import { FileScopes } from '../../driver/file-scopes.js';

describe('verified native source paths', () => {
  it('returns the actual existing source path relative to its selected manifest directory', async () => {
    const scope = await FileScopes.open();
    await scope.keepSource('src/ui/view.expec', 'type Book {}');

    await scope.query('src/ui/view.expec');

    expect(scope.queriedPath()).toBe('src/ui/view.expec');
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('returns a named unsaved path only below verified existing parents without creating the file', async () => {
    const scope = await FileScopes.open();
    await scope.keepFolder('src/ui');

    await scope.query('src/ui/new.expec');

    expect(scope.queriedPath()).toBe('src/ui/new.expec');
    expect(await scope.queriedFileExists()).toBe(false);
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('does not invent ownership for an actual source in a separately owned foreign directory', async () => {
    const authoring = await FileScopes.open();
    const foreign = await FileScopes.open();
    await foreign.keepSource('src/view.expec', 'type Foreign {}');
    const uri = pathToFileURL(join(foreign.directory, 'src/view.expec')).href;

    expect(new FileSources().localPath(uri, authoring.manifest)).toBeUndefined();
  });

  it('returns no native source path for untitled or other nonfile snapshots', async () => {
    const scope = await FileScopes.open();
    const files = new FileSources();

    expect(files.localPath('untitled:Draft', scope.manifest)).toBeUndefined();
    expect(files.localPath('https://example.invalid/view.expec', scope.manifest)).toBeUndefined();
  });

  it('does not treat a missing parent directory as verified ancestry for an unsaved source', async () => {
    const scope = await FileScopes.open();

    await scope.query('missing/new.expec');

    expect(scope.queriedPath()).toBeUndefined();
    expect(await scope.queriedFileExists()).toBe(false);
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('does not return a directory as an ordinary source file', async () => {
    const scope = await FileScopes.open();
    await scope.keepFolder('src/ui');

    await scope.query('src/ui');

    expect(scope.queriedPath()).toBeUndefined();
    expect(await scope.filesUnchanged()).toBe(true);
  });
});

import { link, lstat, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FileSources } from '../../../src/vscode/FileSources.js';
import { FileScopes } from '../../driver/file-scopes.js';

const sourceUri = (scope: FileScopes, name: string): string => pathToFileURL(join(scope.directory, name)).href;
const physicalFact = async (uri: string): Promise<{ dev: bigint; ino: bigint }> => {
  const stat = await lstat(fileURLToPath(uri), { bigint: true });
  return { dev: stat.dev, ino: stat.ino };
};
async function authoringDirectory(): Promise<FileScopes> {
  const scope = await FileScopes.open();
  await scope.keepSource('expec.json', '{}');
  return scope;
}
function expectKnownKey(key: string | undefined): asserts key is string {
  expect(key).toEqual(expect.any(String));
  expect(key).not.toBe('');
}

describe('verified native source identities', () => {
  it('returns the same known identity for repeated queries of one ordinary saved source', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('src/book.expec', 'type Book {}');
    await scope.query('src/book.expec');
    const files = new FileSources();
    const uri = sourceUri(scope, 'src/book.expec');

    const first = files.keyOf(uri, scope.manifest);
    const second = files.keyOf(uri, scope.manifest);

    expectKnownKey(first);
    expectKnownKey(second);
    expect(second).toBe(first);
    expect(files.localPath(uri, scope.manifest)).toBe('src/book.expec');
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('recognizes an encoded file URI spelling through the actual native file', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('book.expec', 'type Book {}');
    await scope.query('book.expec');
    const files = new FileSources();
    const nativeUri = sourceUri(scope, 'book.expec');
    const encodedUri = nativeUri.replace(/\/book\.expec$/, '/%62ook.expec');
    expect(encodedUri).not.toBe(nativeUri);
    expect(await physicalFact(encodedUri)).toEqual(await physicalFact(nativeUri));

    const native = files.keyOf(nativeUri, scope.manifest);
    const encoded = files.keyOf(encodedUri, scope.manifest);

    expectKnownKey(native);
    expectKnownKey(encoded);
    expect(encoded).toBe(native);
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it.runIf(process.platform === 'win32')('recognizes actual Windows filename-case aliases while preserving literal scope paths', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('book.expec', 'type Book {}');
    await scope.query('book.expec');
    const files = new FileSources();
    const lowerUri = sourceUri(scope, 'book.expec');
    const upperUri = sourceUri(scope, 'Book.expec');
    // This assertion proves the arranged native alias; no lowercasing or copied-file fallback.
    expect(await physicalFact(upperUri)).toEqual(await physicalFact(lowerUri));

    const lower = files.keyOf(lowerUri, scope.manifest);
    const upper = files.keyOf(upperUri, scope.manifest);

    expectKnownKey(lower);
    expectKnownKey(upper);
    expect(upper).toBe(lower);
    expect(files.localPath(lowerUri, scope.manifest)).toBe('book.expec');
    expect(files.localPath(upperUri, scope.manifest)).toBe('Book.expec');
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('recognizes two actual hard-link names as the same physical source', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('original.expec', 'type Book {}');
    await link(join(scope.directory, 'original.expec'), join(scope.directory, 'alias.expec'));
    await scope.query('original.expec');
    const files = new FileSources();
    const originalUri = sourceUri(scope, 'original.expec');
    const aliasUri = sourceUri(scope, 'alias.expec');
    expect(await physicalFact(aliasUri)).toEqual(await physicalFact(originalUri));
    expect((await lstat(fileURLToPath(originalUri), { bigint: true })).nlink).toBe(2n);
    expect((await lstat(fileURLToPath(aliasUri), { bigint: true })).nlink).toBe(2n);

    const original = files.keyOf(originalUri, scope.manifest);
    const alias = files.keyOf(aliasUri, scope.manifest);

    expectKnownKey(original);
    expectKnownKey(alias);
    expect(alias).toBe(original);
    expect(files.localPath(originalUri, scope.manifest)).toBe('original.expec');
    expect(files.localPath(aliasUri, scope.manifest)).toBe('alias.expec');
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('keeps separate ordinary files distinct even when their complete saved text is equal', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('book.expec', 'type Book {}');
    await scope.keepSource('second.expec', 'type Book {}');
    await scope.query('book.expec');
    const files = new FileSources();
    const bookUri = sourceUri(scope, 'book.expec');
    const secondUri = sourceUri(scope, 'second.expec');
    expect(await physicalFact(secondUri)).not.toEqual(await physicalFact(bookUri));

    const book = files.keyOf(bookUri, scope.manifest);
    const second = files.keyOf(secondUri, scope.manifest);

    expectKnownKey(book);
    expectKnownKey(second);
    expect(second).not.toBe(book);
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('has no physical identity for a named never-saved source without creating its contents', async () => {
    const scope = await authoringDirectory();
    await scope.keepFolder('src');
    await scope.query('src/new.expec');
    const files = new FileSources();
    const uri = sourceUri(scope, 'src/new.expec');

    expect(files.keyOf(uri, scope.manifest)).toBeUndefined();

    expect(files.localPath(uri, scope.manifest)).toBe('src/new.expec');
    expect(await scope.queriedFileExists()).toBe(false);
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('has no identity when an unsaved source parent directory does not exist', async () => {
    const scope = await authoringDirectory();
    await scope.query('missing/new.expec');
    const files = new FileSources();

    expect(files.keyOf(sourceUri(scope, 'missing/new.expec'), scope.manifest)).toBeUndefined();

    expect(await scope.queriedFileExists()).toBe(false);
    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('does not identify an existing directory as an ordinary source file', async () => {
    const scope = await authoringDirectory();
    await scope.keepFolder('src/book.expec');
    await scope.query('src/book.expec');
    const files = new FileSources();

    expect(files.keyOf(sourceUri(scope, 'src/book.expec'), scope.manifest)).toBeUndefined();

    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('does not identify foreign files or a real link escaping the selected authoring root', async () => {
    const scope = await authoringDirectory();
    const foreign = await authoringDirectory();
    await foreign.keepSource('book.expec', 'type Foreign {}');
    await scope.keepEscapingLink('escape', 'book.expec', 'type Outside {}');
    await foreign.query('book.expec');
    await scope.query('escape/book.expec');
    const files = new FileSources();

    expect(files.keyOf(sourceUri(foreign, 'book.expec'), scope.manifest)).toBeUndefined();
    expect(files.keyOf(sourceUri(scope, 'escape/book.expec'), scope.manifest)).toBeUndefined();

    expect(await scope.filesUnchanged()).toBe(true);
    expect(await foreign.filesUnchanged()).toBe(true);
  });

  it('does not invent physical identities for unsupported source URI forms', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('book.expec', 'type Book {}');
    await scope.query('book.expec');
    const files = new FileSources();
    const uri = sourceUri(scope, 'book.expec');

    expect(files.keyOf('untitled:Book', scope.manifest)).toBeUndefined();
    expect(files.keyOf('https://example.invalid/book.expec', scope.manifest)).toBeUndefined();
    expect(files.keyOf(uri + '?proposal=1', scope.manifest)).toBeUndefined();
    expect(files.keyOf(uri + '#Book', scope.manifest)).toBeUndefined();

    expect(await scope.filesUnchanged()).toBe(true);
  });

  it('observes a real same-text file replacement through the same provider without reusing its old identity', async () => {
    const scope = await authoringDirectory();
    await scope.keepSource('book.expec', 'type Book {}');
    await scope.query('book.expec');
    const files = new FileSources();
    const uri = sourceUri(scope, 'book.expec');
    const retainedUri = sourceUri(scope, 'previous.expec');
    const originalFact = await physicalFact(uri);
    const original = files.keyOf(uri, scope.manifest);
    expectKnownKey(original);
    expect(await scope.filesUnchanged()).toBe(true);
    // Keep the original native file alive so a reused inode cannot fake this replacement fixture.
    await rename(fileURLToPath(uri), fileURLToPath(retainedUri));
    await writeFile(fileURLToPath(uri), 'type Book {}', { encoding: 'utf8', flag: 'wx' });
    const replacementFact = await physicalFact(uri);
    expect(replacementFact).not.toEqual(originalFact);
    expect(await physicalFact(retainedUri)).toEqual(originalFact);

    const replacement = files.keyOf(uri, scope.manifest);
    const retained = files.keyOf(retainedUri, scope.manifest);

    expectKnownKey(replacement);
    expectKnownKey(retained);
    expect(replacement).not.toBe(original);
    expect(retained).toBe(original);
    expect(await physicalFact(uri)).toEqual(replacementFact);
    expect(await physicalFact(retainedUri)).toEqual(originalFact);
    expect(await readFile(fileURLToPath(uri), 'utf8')).toBe('type Book {}');
    expect(await readFile(fileURLToPath(retainedUri), 'utf8')).toBe('type Book {}');
    expect((await readdir(scope.directory)).sort()).toEqual(['book.expec', 'expec.json', 'previous.expec']);
  });
});

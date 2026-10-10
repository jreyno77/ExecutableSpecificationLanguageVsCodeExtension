import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { acquireNativeVsix, completeNativeVsix } from '../../driver/vscode/native-vsix.js';
import { InstalledExpecEditor } from '../../driver/vscode/installed-extension.js';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';

// Tiny owned bytes prove this archive handoff, not ZIP validity or an installed host.
const authored = Buffer.from('Exact CI archive bytes: Bibliothèque 📚\n', 'utf8');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function files() {
  const root = await ownTemporaryDirectory('expec-native-vsix-control-');
  onTestFinished(() => removeOwnedDirectory(root));
  const project = join(root, 'project'), directory = join(root, 'installation');
  await Promise.all([mkdir(project), mkdir(directory)]);
  const source = join(root, 'validated.vsix'), evidence = join(root, 'native-proof.json');
  await writeFile(source, authored);
  let packaged = 0;
  const packageLocal = async (path: string) => { packaged++; await writeFile(path, authored); };
  return { project, directory, source, evidence, packageLocal, packaged: () => packaged };
}
const absent = async (path: string) => expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });

it('copies the supplied archive byte-for-byte into a distinct owned file without packaging', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  expect(archive.path).toBe(join(fixture.directory, 'expec.vsix'));
  expect(await readFile(archive.path)).toEqual(authored);
  expect(await readFile(fixture.source)).toEqual(authored);
  expect(archive.sourceSha256).toBe(sha256(authored));
  expect(archive.copiedSha256).toBe(sha256(authored));
  const source = await stat(fixture.source, { bigint: true }), copy = await stat(archive.path, { bigint: true });
  expect([copy.dev, copy.ino]).not.toEqual([source.dev, source.ino]);
  expect(fixture.packaged()).toBe(0);
});

it('an explicitly relative supplied archive refuses instead of falling back to packaging', async () => {
  const fixture = await files();
  await expect(acquireNativeVsix(fixture.project, fixture.directory, 'dist/archive.vsix', fixture.packageLocal)).rejects.toThrow(/absolute/);
  expect(fixture.packaged()).toBe(0);
  expect(await readdir(fixture.directory)).toEqual([]);
});

it('an explicitly empty supplied archive refuses instead of selecting local packaging', async () => {
  const fixture = await files();
  await expect(acquireNativeVsix(fixture.project, fixture.directory, '', fixture.packageLocal)).rejects.toThrow(/absolute/);
  expect(fixture.packaged()).toBe(0);
  expect(await readdir(fixture.directory)).toEqual([]);
});

it('a missing supplied archive refuses without creating an owned copy or local package', async () => {
  const fixture = await files();
  await expect(acquireNativeVsix(fixture.project, fixture.directory, join(fixture.project, 'missing.vsix'), fixture.packageLocal)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(fixture.packaged()).toBe(0);
  expect(await readdir(fixture.directory)).toEqual([]);
});

it('a supplied directory is not accepted as archive bytes', async () => {
  const fixture = await files();
  await expect(acquireNativeVsix(fixture.project, fixture.directory, fixture.project, fixture.packageLocal)).rejects.toThrow(/regular file/);
  expect(fixture.packaged()).toBe(0);
  expect(await readdir(fixture.directory)).toEqual([]);
});

it('only an absent supplied path uses the explicit local packaging boundary', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, undefined, fixture.packageLocal);
  expect(fixture.packaged()).toBe(1);
  expect(archive.supplied).toBe(false);
  expect(await readFile(archive.path)).toEqual(authored);
  expect(archive.copiedSha256).toBe(sha256(authored));
});

it('writes the exact native proof from rechecked source and copied bytes after confirmed ownership', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  await completeNativeVsix(archive, fixture.project, fixture.evidence, true);
  expect(JSON.parse(await readFile(fixture.evidence, 'utf8'))).toEqual({
    kind: 'installed-vsix', sourceSha256: sha256(authored), copiedSha256: sha256(authored),
    postNativeSha256: sha256(authored), nativeHost: true,
  });
  expect(await readFile(archive.path)).toEqual(authored);
  expect(await readFile(fixture.source)).toEqual(authored);
});

it('changed source bytes refuse native proof while preserving the owned tested copy', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  await writeFile(fixture.source, 'A repackaged archive.\n');
  await expect(completeNativeVsix(archive, fixture.project, fixture.evidence, true)).rejects.toThrow(/changed/);
  await absent(fixture.evidence);
  expect(await readFile(archive.path)).toEqual(authored);
});

it('changed owned-copy bytes refuse native proof while preserving the validated source', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  await writeFile(archive.path, 'Different installed bytes.\n');
  await expect(completeNativeVsix(archive, fixture.project, fixture.evidence, true)).rejects.toThrow(/changed/);
  await absent(fixture.evidence);
  expect(await readFile(fixture.source)).toEqual(authored);
});

it('replacing the source file with equal bytes still refuses its captured file identity', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  const before = await stat(fixture.source, { bigint: true });
  const replacement = join(fixture.project, 'replacement.vsix');
  await writeFile(replacement, authored);
  await rename(replacement, fixture.source);
  const after = await stat(fixture.source, { bigint: true });
  expect([after.dev, after.ino]).not.toEqual([before.dev, before.ino]);
  expect(await readFile(fixture.source)).toEqual(authored);
  await expect(completeNativeVsix(archive, fixture.project, fixture.evidence, true)).rejects.toThrow(/changed/);
  await absent(fixture.evidence);
});

it('an installation without an actual confirmed native host cannot write proof', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  await expect(completeNativeVsix(archive, fixture.project, fixture.evidence, false)).rejects.toThrow(/confirmed native host/);
  await absent(fixture.evidence);
  expect(await readFile(archive.path)).toEqual(authored);
});

it('proof cannot be written into the project that is being packaged', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  const inside = join(fixture.project, 'native-proof.json');
  await expect(completeNativeVsix(archive, fixture.project, inside, true)).rejects.toThrow(/outside/);
  await absent(inside);
});

it('proof cannot be written into the installation tree that cleanup removes', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  const inside = join(fixture.directory, 'native-proof.json');
  await expect(completeNativeVsix(archive, fixture.project, inside, true)).rejects.toThrow(/outside/);
  await absent(inside);
});

it('proof requires an absolute path rather than depending on the working directory', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  await expect(completeNativeVsix(archive, fixture.project, 'native-proof.json', true)).rejects.toThrow(/absolute/);
});

it('local packaging cannot certify the separate CI archive handoff', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, undefined, fixture.packageLocal);
  await expect(completeNativeVsix(archive, fixture.project, fixture.evidence, true)).rejects.toThrow(/supplied archive/);
  await absent(fixture.evidence);
});

it('an existing proof is refused rather than overwritten or reused as current native evidence', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  const earlier = 'Earlier receipt is not this test run.\n';
  await writeFile(fixture.evidence, earlier);
  await expect(completeNativeVsix(archive, fixture.project, fixture.evidence, true)).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(fixture.evidence, 'utf8')).toBe(earlier);
});

it('a proof path through a directory alias still refuses its canonical project location', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  const alias = join(fixture.project, '..', 'project-alias');
  await symlink(fixture.project, alias, 'junction');
  await expect(completeNativeVsix(archive, fixture.project, join(alias, 'native-proof.json'), true)).rejects.toThrow(/outside/);
  await absent(join(fixture.project, 'native-proof.json'));
});

it('actual installation disposal retains the archive and writes no proof when owned cleanup rejects', async () => {
  const fixture = await files();
  const archive = await acquireNativeVsix(fixture.project, fixture.directory, fixture.source, fixture.packageLocal);
  const editor = Reflect.construct(InstalledExpecEditor, [fixture.directory, fixture.directory,
    'no-unit-native-executable', 'unit.expec', fixture.directory, {}]) as InstalledExpecEditor;
  const ownership = editor as unknown as {
    archive: typeof archive; evidencePath: string; nativeHostConfirmed: boolean;
    activeSession: { dispose(): Promise<void> };
  };
  ownership.archive = archive;
  ownership.evidencePath = fixture.evidence;
  ownership.nativeHostConfirmed = true; // Controlled disposal state, not an installed-host claim.
  const refused = new Error('Original owned session cleanup failure.');
  ownership.activeSession = { dispose: async () => { throw refused; } };
  let actual: unknown;
  try { await editor.dispose(); } catch (error) { actual = error; }
  expect(actual).toBeInstanceOf(NativeCleanupError);
  expect((actual as Error).cause).toBeInstanceOf(AggregateError);
  expect(((actual as Error).cause as AggregateError).errors).toContain(refused);
  await absent(fixture.evidence);
  expect(await readFile(archive.path)).toEqual(authored);
});

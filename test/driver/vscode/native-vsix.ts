import { createHash } from 'node:crypto';
import { lstat, open, realpath, writeFile } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { inside } from './native-process.js';

export interface NativeVsix {
  readonly path: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly copiedSha256: string;
  readonly supplied: boolean;
  readonly sourceVersion: string;
  readonly copiedVersion: string;
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const version = (file: BigIntStats) => [file.dev, file.ino, file.mode, file.size, file.mtimeNs, file.ctimeNs].join(':');

/** Read the same real regular file before, through and after its owned handle. */
async function readArchive(path: string): Promise<{ bytes: Buffer; sha256: string; version: string }> {
  const named = await lstat(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink()) throw new Error('The native VSIX must be a regular file.');
  const handle = await open(path, 'r');
  const failures: unknown[] = [];
  let actual: { bytes: Buffer; sha256: string; version: string } | undefined;
  try {
    if (version(await handle.stat({ bigint: true })) !== version(named)) throw new Error('Native VSIX file changed while opening: ' + path);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true }), current = await lstat(path, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || version(after) !== version(named)
      || version(current) !== version(named) || BigInt(bytes.length) !== named.size) {
      throw new Error('Native VSIX file changed while reading: ' + path);
    }
    actual = { bytes, sha256: digest(bytes), version: version(named) };
  } catch (error) { failures.push(error); }
  try { await handle.close(); } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Native VSIX acquisition and handle cleanup failed.');
  return actual!;
}

/** A supplied path never invokes the explicit local packaging fallback. */
export async function acquireNativeVsix(project: string, directory: string, supplied: string | undefined,
  packageLocal: (path: string) => Promise<void>): Promise<NativeVsix> {
  const path = join(directory, 'expec.vsix');
  if (supplied === undefined) {
    console.info('Native VSIX setup: explicit local packaging fallback.');
    await packageLocal(path);
    const copied = await readArchive(path);
    return { path, sourcePath: path, sourceSha256: copied.sha256, copiedSha256: copied.sha256,
      supplied: false, sourceVersion: copied.version, copiedVersion: copied.version };
  }
  if (!isAbsolute(supplied)) throw new Error('The supplied native VSIX requires an absolute file path.');
  const sourcePath = resolve(supplied), source = await readArchive(sourcePath);
  await writeFile(path, source.bytes, { flag: 'wx' });
  const copied = await readArchive(path), currentSource = await readArchive(sourcePath);
  if (currentSource.version !== source.version || currentSource.sha256 !== source.sha256 || copied.sha256 !== source.sha256) {
    throw new Error('The supplied native VSIX changed during its owned byte copy.');
  }
  return { path, sourcePath, sourceSha256: source.sha256, copiedSha256: copied.sha256,
    supplied: true, sourceVersion: source.version, copiedVersion: copied.version };
}

/** Called only after every owned observation and native session has settled. */
export async function completeNativeVsix(archive: NativeVsix, project: string, evidencePath: string | undefined,
  nativeHost: boolean): Promise<void> {
  if (evidencePath !== undefined) {
    if (!nativeHost) throw new Error('Native VSIX evidence requires an actual confirmed native host.');
    if (!archive.supplied) throw new Error('Native VSIX evidence requires the supplied archive, not a local package.');
    if (!isAbsolute(evidencePath)) throw new Error('Native VSIX evidence requires an absolute path.');
  }
  const source = await readArchive(archive.sourcePath), copied = await readArchive(archive.path);
  if (source.version !== archive.sourceVersion || source.sha256 !== archive.sourceSha256
    || copied.version !== archive.copiedVersion || copied.sha256 !== archive.copiedSha256
    || source.sha256 !== copied.sha256) throw new Error('Native VSIX source or owned copy changed after installation.');
  if (evidencePath === undefined) return;
  const [projectRoot, ownedRoot, parent] = await Promise.all([
    realpath(project), realpath(dirname(archive.path)), realpath(dirname(resolve(evidencePath))),
  ]);
  const evidence = join(parent, basename(evidencePath));
  if (evidence === projectRoot || inside(projectRoot, evidence) || evidence === ownedRoot || inside(ownedRoot, evidence)) {
    throw new Error('Native VSIX evidence must be outside the project and owned installation tree.');
  }
  await writeFile(evidence, JSON.stringify({ kind: 'installed-vsix', sourceSha256: source.sha256,
    copiedSha256: archive.copiedSha256, postNativeSha256: copied.sha256, nativeHost: true }) + '\n', { flag: 'wx' });
}

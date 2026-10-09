import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { GenerationInputs } from '../../../src/core/generation-inputs.js';
import type { GenerationRequest } from '../../../src/core/GenerationRequest.js';
import { ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';

it('recognizes an ordinary saved entry and the SDK canonical project root', async () => {
  const directory = await ownTemporaryDirectory('expec-generation-path-');
  try {
    const sourceFile = join(directory, 'main.expec');
    const manifest = join(directory, 'expec.json');
    const target = join(directory, 'target');
    const sourceText = 'type Book { title: Text }';
    const configurationText = JSON.stringify({ formatVersion: 1, version: '0.1.0',
      project: { root: 'target' }, build: { entries: ['main.expec'] }, outputs: [] });
    await fs.mkdir(target);
    await fs.writeFile(sourceFile, sourceText);
    await fs.writeFile(manifest, configurationText);
    const request: GenerationRequest = {
      configuration: { file: manifest, text: configurationText, writable: true },
      source: { uri: pathToFileURL(sourceFile).href, text: sourceText }, version: 1,
    };
    const buffers = [
      { uri: request.source.uri, text: sourceText, version: 1, dirty: false },
      { uri: pathToFileURL(manifest).href, text: configurationText, version: 1, dirty: false },
    ];
    const inputs = new GenerationInputs({ buffers: () => buffers.map(buffer => ({ ...buffer })) });
    const configuration = inputs.configuration(request);
    // These are real filesystem spellings and physical identities, including
    // native expansion of the runner's temporary path on Windows.
    const nativeSource = await fs.realpath(sourceFile);
    const nativeTarget = await fs.realpath(target);
    const sourceIdentity = await fs.stat(sourceFile, { bigint: true });
    const nativeSourceIdentity = await fs.stat(nativeSource, { bigint: true });
    const targetIdentity = await fs.stat(target, { bigint: true });
    const nativeTargetIdentity = await fs.stat(nativeTarget, { bigint: true });
    expect([nativeSourceIdentity.dev, nativeSourceIdentity.ino])
      .toEqual([sourceIdentity.dev, sourceIdentity.ino]);
    expect([nativeTargetIdentity.dev, nativeTargetIdentity.ino])
      .toEqual([targetIdentity.dev, targetIdentity.ino]);
    expect(await fs.readFile(nativeSource, 'utf8')).toBe('type Book { title: Text }');
    expect(await inputs.member(request, configuration)).toBe(true);
    expect(inputs.problems(request, configuration, nativeTarget)).toEqual([]);
  } finally {
    await removeOwnedDirectory(directory);
  }
});

import { expect, it, onTestFinished } from 'vitest';
import { promises as fs, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GenerationOnSave } from '../../../src/core/GenerationOnSave.js';
import type { GenerationBuffer } from '../../../src/core/GenerationBuffer.js';
import type { GenerationRequest } from '../../../src/core/GenerationRequest.js';
import type { GenerationRunFeedback } from '../../../src/core/GenerationRunFeedback.js';
import type { GenerationState } from '../../../src/core/GenerationState.js';
import type { GenerationResult } from '../../../src/core/GenerationResult.js';
import { ownTemporaryDirectory, removeOwnedDirectory, within } from '../../driver/vscode/native-process.js';
import { GenerationOnSaveRecording } from '../../driver/generation-on-save.js';

it('a saved entry asks the SDK to update every configured saved entry', async () => {
  const generation = await GenerationOnSaveRecording.create('type Book { title: Text }', 'type Shelf { copies: Number }', false);
  await generation.saveOther('type Shelf { copies: Text }');
  generation.setEnabled(true);
  await generation.edit('type Book { title: Number }');
  await generation.save();
  await generation.settle();
  expect(generation.status()).toBe('built');
  expect(await generation.fileIncludes('src/Book.ts', 'title: number;')).toBe(true);
  expect(await generation.fileIncludes('src/Shelf.ts', 'copies: string;')).toBe(true);
}, 30_000);

it('a newer save delivered by buffer inspection survives the obsolete observation', async () => {
  const r = await reentrantGeneration();
  r.save('type Book { title: Text }', 1);
  await r.waitFor(() => r.starts.length === 1);
  r.onBuffers(() => r.save('type Book { title: Number }', 2));
  const publications = r.states.length;
  r.core.editorChanged();
  expect(r.states.slice(publications)).not.toContainEqual(expect.objectContaining({ sourceVersion: 1, status: 'blocked' }));
  await r.waitFor(() => r.states.at(-1)?.sourceVersion === 2 && r.states.at(-1)?.status === 'queued');
  expect(r.cancellations()).toBe(1);
  expect(r.starts).toHaveLength(1);
  r.finish(0);
  await r.waitFor(() => r.starts.length === 2);
  expect(r.starts[1].request.version).toBe(2);
  expect(r.starts[1].request.source.text).toBe('type Book { title: Number }');
  expect(r.states.at(-1)?.status).toBe('generating');
});

it('a disabled manifest selected during cancellation stays current after the outer selection returns', async () => {
  const r = await reentrantGeneration();
  r.save('type Book { title: Text }', 1);
  await r.waitFor(() => r.starts.length === 1);
  const newer = { file: join(r.directory, 'newer.json'), text: r.configuration.text, writable: true };
  r.onCancel(() => r.finish(0));
  r.onRecord(() => r.core.configurationChanged(newer, false));
  r.core.configurationChanged({ file: join(r.directory, 'intermediate.json'), text: r.configuration.text, writable: true }, true);
  expect(r.states.at(-1)?.configurationFile).toBe(newer.file);
  expect(r.states.at(-1)?.status).toBe('disabled');
  expect(r.records).toHaveLength(1);
  expect(r.cancellations()).toBe(1);
  expect(r.starts).toHaveLength(1);
});

// A controlled scheduling port over actual saved inputs. No generation success
// or file effects are manufactured; the worker only reports its own refusal.
async function reentrantGeneration() {
  const directory = await ownTemporaryDirectory('expec-generation-reentry-');
  try {
    const file = join(directory, 'main.expec'), manifest = join(directory, 'expec.json');
    const text = 'type Book { title: Text }';
    const configuration = { file: manifest, text: JSON.stringify({ formatVersion: 1, version: '0.1.0',
      project: { root: 'target' }, build: { entries: ['main.expec'] }, outputs: [] }), writable: true };
    await fs.mkdir(join(directory, 'target'));
    await fs.writeFile(file, text); await fs.writeFile(manifest, configuration.text);
    const buffers = new Map<string, GenerationBuffer>();
    const uri = pathToFileURL(file).href;
    buffers.set(uri, { uri, text, version: 1, dirty: false });
    const manifestUri = pathToFileURL(manifest).href;
    buffers.set(manifestUri, { uri: manifestUri, text: configuration.text, version: 1, dirty: false });
    const starts: Array<{ request: GenerationRequest; feedback: GenerationRunFeedback; finished: boolean }> = [];
    const states: GenerationState[] = [], records: GenerationResult[] = [];
    const listeners = new Set<() => void>();
    const notify = () => { for (const listener of [...listeners]) listener(); };
    let nextBuffers: (() => void) | undefined, nextCancel: (() => void) | undefined, nextRecord: (() => void) | undefined;
    let cancellations = 0;
    const core = new GenerationOnSave({
      start: (request, feedback) => { starts.push({ request, feedback, finished: false }); notify(); },
      cancel: () => { cancellations++; const callback = nextCancel; nextCancel = undefined; callback?.(); notify(); },
      dispose: completion => completion.stopped(undefined),
    }, { buffers: () => {
      const callback = nextBuffers; nextBuffers = undefined; callback?.();
      return [...buffers.values()].map(buffer => ({ ...buffer }));
    } }, {
      present: state => { states.push({ ...state }); notify(); },
      record: (_file, result) => { records.push({ ...result }); const callback = nextRecord; nextRecord = undefined; callback?.(); notify(); },
    });
    const finish = (index: number) => {
      const start = starts[index]; if (!start || start.finished) throw Error('No pending scheduling request.');
      start.finished = true; start.feedback.finished({ report: '', error: 'Controlled scheduling refusal.' }); notify();
    };
    core.configurationChanged(configuration, true);
    onTestFinished(async () => {
      core.dispose();
      for (const [index, start] of starts.entries()) if (!start.finished) finish(index);
      listeners.clear(); await removeOwnedDirectory(directory);
    });
    return { core, directory, configuration, starts, states, records, finish, cancellations: () => cancellations,
      onBuffers: (callback: () => void) => { nextBuffers = callback; }, onCancel: (callback: () => void) => { nextCancel = callback; },
      onRecord: (callback: () => void) => { nextRecord = callback; },
      save: (value: string, version: number) => {
        writeFileSync(file, value); buffers.set(uri, { uri, text: value, version, dirty: false });
        core.sourceSaved({ uri, text: value }, version);
      },
      waitFor: async (condition: () => boolean) => {
        let check!: () => void;
        try { await within(new Promise<void>(done => {
          check = () => { if (condition()) { listeners.delete(check); done(); } }; listeners.add(check); check();
        }), 2_000, 'The actual reentrant coordinator callback did not arrive.'); }
        finally { listeners.delete(check); }
      },
    };
  } catch (error) { await removeOwnedDirectory(directory); throw error; }
}

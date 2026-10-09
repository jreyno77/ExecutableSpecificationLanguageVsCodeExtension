import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeGenerationWorker } from '../../../src/core/NodeGenerationWorker.js';
import type { GenerationRequest } from '../../../src/core/GenerationRequest.js';
import type { GenerationResult } from '../../../src/core/GenerationResult.js';
import { errorText } from '../../../src/core/generation-worker-protocol.js';

const owned: Array<{ root: string; worker?: NodeGenerationWorker }> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const item of owned.splice(0)) {
    try {
      if (item.worker) await new Promise<void>((done, reject) => item.worker!.dispose({ stopped(error) { if (error) reject(Error(error)); else done(); } }));
    } catch (error) { errors.push(error); }
    try { await rm(item.root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Owned worker test cleanup failed.');

});

async function processRequest(): Promise<{ root: string; request: GenerationRequest }> {
  const root = await mkdtemp(join(tmpdir(), 'expec-worker-process-'));
  owned.push({ root });
  const manifest = join(root, 'expec.json');
  await writeFile(manifest, '{}');
  return { root, request: { configuration: { file: manifest, text: '{}', writable: true },
    source: { uri: pathToFileURL(join(root, 'source.expec')).href, text: 'type Book { title: Text }' }, version: 1 } };
}

function explicitWorker(root: string, entry: string): NodeGenerationWorker {
  // This test runner is the pinned Node runtime; pass it explicitly, never a product fallback.
  const worker = new NodeGenerationWorker(process.execPath, resolve('test/resources/generation-worker', entry));
  owned.find(item => item.root === root)!.worker = worker;
  return worker;
}

describe('owned Node generation process', () => {
  it('finishes after its explicit Node child closes and preserves only the reported CLI stream', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'completion.mjs');
    let results = 0;
    const result = await new Promise<GenerationResult>((done, reject) => {
      worker.start(request, { writeProblems() { return []; }, finished(value) {
        try {
          results++;
          const actual = JSON.parse(value.report);
          expect(() => process.kill(actual.pid, 0)).toThrow();
          done(value);
        } catch (error) { reject(error); }
      } });
    });
    expect(result.runtimeVersion).toBe('24.19.0');
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.report)).toMatchObject({ transport: 'finished', manifest: request.configuration.file });
    expect(result.report).not.toContain('unrelated native application log');
    expect(results).toBe(1);
  });
  it('closes a child that disconnects during permission and reports uncertain effects once', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'disconnected.mjs');
    let checks = 0;
    let results = 0;
    const result = await new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems(actualRoot) { checks++; expect(actualRoot).toBe(root); return []; },
      finished(value) { results++; done(value); },
    }));
    expect(checks).toBe(1);
    expect(results).toBe(1);
    expect(result.report).toBe('');
    expect(result.error).toContain('IPC');
    expect(result.error).toContain('uncertain');
    const stopped = await new Promise<string | undefined>(done => worker.dispose({ stopped: done }));
    expect(stopped).toContain('uncertain');
    // The expected cleanup failure has now been inspected; avoid re-reporting it in afterEach.
    owned.find(item => item.root === root)!.worker = undefined;
  }, 10000);

  it('round-trips fresh plain editor refusals without turning successful stderr into failure', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'permission.mjs');
    let checks = 0;
    const result = await new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems(actualRoot) {
        checks++; expect(actualRoot).toBe(root);
        return [{ code: 'dirty-editor', path: join(root, 'src/Book.ts'), message: 'Book is dirty 📚' }];
      }, finished: done,
    }));
    expect(checks).toBe(1);
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.report).problems).toEqual([{ code: 'dirty-editor', path: join(root, 'src/Book.ts'), message: 'Book is dirty 📚' }]);
  });

  it('returns an actual permission callback failure instead of an empty approval', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'permission.mjs');
    const result = await new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems() { throw Error('Actual editor observation failed.'); }, finished: done,
    }));
    expect(JSON.parse(result.report)).toMatchObject({ problems: [], error: 'Actual editor observation failed.' });
  });

  it('cancels once and joins repeated shutdown callers after the child closes', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'cancellation.mjs');
    let checked!: () => void;
    const permission = new Promise<void>(done => { checked = done; });
    const order: string[] = [];
    const finished = new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems() { checked(); return []; },
      finished(value) { order.push('finished'); done(value); },
    }));
    expect(() => worker.start(request, { writeProblems: () => [], finished() {} })).toThrow('active build');
    await permission;
    worker.cancel();
    const first = new Promise<void>((done, reject) => worker.dispose({ stopped(error) { order.push('first'); error ? reject(Error(error)) : done(); } }));
    const second = new Promise<void>((done, reject) => worker.dispose({ stopped(error) { order.push('second'); error ? reject(Error(error)) : done(); } }));
    expect(() => worker.start(request, { writeProblems: () => [], finished() {} })).toThrow('disposed');
    const result = await finished;
    await Promise.all([first, second]);
    const actual = JSON.parse(result.report);
    expect(actual.cancels).toBe(1);
    expect(() => process.kill(actual.pid, 0)).toThrow();
    expect(order).toEqual(['finished', 'first', 'second']);
  });

  it('reports an actual missing executable launch without inventing a CLI receipt', async () => {
    const { root, request } = await processRequest();
    const worker = new NodeGenerationWorker(join(root, 'missing-node.exe'), resolve('test/resources/generation-worker/completion.mjs'));
    owned.find(item => item.root === root)!.worker = worker;
    let finished = 0;
    const result = await new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems: () => [], finished(value) { finished++; done(value); },
    }));
    expect(result.runtimeVersion).toBeUndefined();
    expect(result.report).toBe('');
    expect(result.error).toContain('ENOENT');
    expect(finished).toBe(1);
  });
  it('allows a disconnected child to finish its own actual descendant cleanup', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'descendant-disconnect.mjs');
    const result = await new Promise<GenerationResult>(done => worker.start(request, { writeProblems: () => [], finished: done }));
    const actual = JSON.parse(await readFile(join(root, 'descendant.json'), 'utf8'));
    try {
      expect(await readFile(join(root, 'cleanup.txt'), 'utf8')).toBe('descendant closed');
      expect(() => process.kill(actual.worker, 0)).toThrow();
      expect(() => process.kill(actual.descendant, 0)).toThrow();
      expect(result.error).toContain('descendant state is unconfirmed');
    } finally {
      // The literal RED itself owns the descendant and must not leave it running.
      try { process.kill(actual.descendant, 'SIGKILL'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
      await new Promise<void>(done => worker.dispose({ stopped() { done(); } }));
      owned.find(item => item.root === root)!.worker = undefined;
    }
  });
  it('bounds actual stderr evidence and explains overflow instead of silently claiming success', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'stderr-overflow.mjs');
    const result = await new Promise<GenerationResult>(done => worker.start(request, { writeProblems: () => [], finished: done }));
    try {
      expect(result.error).toContain('stderr evidence exceeded');
      expect(result.error).toContain('truncated');
      expect(result.error!.length).toBeLessThan(67000);
    } finally {
      await new Promise<void>(done => worker.dispose({ stopped() { done(); } }));
      owned.find(item => item.root === root)!.worker = undefined;
    }
  });
  it('disposes an accepted terminal result while waiting for actual CLOSE without cancelling completed work', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'terminal-before-close.mjs');
    const finished = new Promise<GenerationResult>(done => worker.start(request, { writeProblems: () => [], finished: done }));
    try {
      await expect.poll(async () => {
        try { return await readFile(join(root, 'terminal-disconnected.txt'), 'utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
      }).toBe('terminal sent and IPC disconnected');
      const stopped = new Promise<string | undefined>(done => worker.dispose({ stopped: done }));
      await writeFile(join(root, 'release-close.txt'), 'release');
      const [result, cleanupError] = await Promise.all([finished, stopped]);
      owned.find(item => item.root === root)!.worker = undefined;
      expect(result.error).toBeUndefined();
      expect(cleanupError).toBeUndefined();
      expect(JSON.parse(result.report).completed).toBe(true);
    } finally {
      // Release even the RED's child before afterEach joins its owned process.
      await writeFile(join(root, 'release-close.txt'), 'release');
    }
  });
  it('formats an actual self-caused error without recursive failure', () => {
    const failure = Error('Actual editor observation failed.');
    failure.cause = failure;
    expect(errorText(failure)).toBe('Actual editor observation failed.\n[circular error]');
  });

  it('formats an actual self-containing aggregate without losing its other cause', () => {
    const failure = new AggregateError([], 'Actual editor cleanup failed.');
    failure.errors.push(Error('Actual source lookup failed.'), failure);
    expect(errorText(failure)).toBe('Actual editor cleanup failed.\nActual source lookup failed.\n[circular error]');
  });
  it('reports a real cyclic permission failure through its actual child without losing completion', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'permission.mjs');
    const failure = Error('Actual editor observation failed.');
    failure.cause = failure;
    const result = await new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems() { throw failure; }, finished: done,
    }));
    expect(JSON.parse(result.report)).toMatchObject({ problems: [], error: 'Actual editor observation failed.\n[circular error]' });
  });

  it('reports a self-containing aggregate permission failure through its actual child', async () => {
    const { root, request } = await processRequest();
    const worker = explicitWorker(root, 'permission.mjs');
    const failure = new AggregateError([], 'Actual editor cleanup failed.');
    failure.errors.push(Error('Actual source lookup failed.'), failure);
    const result = await new Promise<GenerationResult>(done => worker.start(request, {
      writeProblems() { throw failure; }, finished: done,
    }));
    expect(JSON.parse(result.report)).toMatchObject({ problems: [], error: 'Actual editor cleanup failed.\nActual source lookup failed.\n[circular error]' });
  });

  it('labels oversized diagnostic evidence instead of returning unbounded text', () => {
    const actual = errorText(Error('W'.repeat(20000)));
    expect(actual.length).toBeLessThanOrEqual(8192);
    expect(actual).toContain('[error details truncated]');
    expect(actual.startsWith('WWW')).toBe(true);
  });

  it('retains the actual error message when reading its cause itself throws', () => {
    const failure = Error('Actual editor observation failed.');
    Object.defineProperty(failure, 'cause', { get() { throw Error('Cause access failed.'); } });
    expect(errorText(failure)).toBe('Actual editor observation failed.\n[unreadable error]');
  });});

import { beforeEach, expect, it, vi } from 'vitest';
import type { ExtensionContext } from 'vscode';
import type { GenerationWorker } from '../../../src/core/GenerationWorker.js';
import type { GenerationShutdownFeedback } from '../../../src/core/GenerationShutdownFeedback.js';
import type { GenerationRunFeedback } from '../../../src/core/GenerationRunFeedback.js';
import { activate, deactivate } from '../../../src/vscode/extension.js';

const native = vi.hoisted(() => ({ worker: undefined as GenerationWorker | undefined,
  childCompletion: undefined as GenerationShutdownFeedback | undefined,
  childFeedback: undefined as GenerationRunFeedback | undefined }));
vi.mock('vscode', () => ({ workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => 'node' }) },
  Uri: { file: (file: string) => ({ fsPath: file }) } }));
vi.mock('vscode-languageclient/node', () => ({ TransportKind: { ipc: 1 },
  LanguageClient: class { stop() { return Promise.resolve(); } } }));
vi.mock('../../../src/vscode/EditorLanguageSupport.js', () => ({ EditorLanguageSupport: class { start() {} dispose() {} } }));
vi.mock('../../../src/vscode/OutputPreviewHost.js', () => ({ OutputPreviewHost: class { start() {} dispose() {} configurationChanged() {} } }));
vi.mock('../../../src/vscode/ConnectionSidebar.js', () => ({ ConnectionSidebar: class { dispose() {} } }));
// This isolated assembly consumer records the supplied worker port; it does not
// substitute any SDK generation result or make a native-process claim.
vi.mock('../../../src/vscode/GenerationHost.js', () => ({ GenerationHost: class {
  constructor(_context: unknown, worker: GenerationWorker) { native.worker = worker; }
  start() {} configurationChanged() {}
  shutdown(completion: GenerationShutdownFeedback) { native.worker!.dispose(completion); }
} }));
vi.mock('../../../src/core/NodeGenerationWorker.js', () => ({ NodeGenerationWorker: class {
  start(_request: unknown, feedback: GenerationRunFeedback) { native.childFeedback = feedback; } cancel() {} dispose(completion: GenerationShutdownFeedback) { native.childCompletion = completion; }
} }));

beforeEach(() => { native.worker = undefined; native.childCompletion = undefined; native.childFeedback = undefined; });
it('assembly shutdown preserves a throwing observer and still completes the awaited native entry', async () => {
  activate({ subscriptions: [], asAbsolutePath: (file: string) => '/packaged/' + file } as unknown as ExtensionContext);
  native.worker!.start({ configuration: { file: '/selected/expec.json', writable: true },
    source: { uri: 'file:///main.expec', text: 'type Book { title: Text }' }, version: 1 }, { writeProblems: () => [], finished() {} });
  native.worker!.dispose({ stopped: () => { throw Error('assembly shutdown observer failed'); } });
  let result: unknown;
  const stopped = deactivate().then(() => { result = 'completed'; }, error => { result = error; });
  expect(native.childCompletion).toBeDefined();
  expect(() => native.childCompletion!.stopped(undefined)).not.toThrow();
  await stopped;
  expect(result).toBeInstanceOf(AggregateError);
  expect((result as AggregateError).errors.map(error => String(error)).join('\n')).toContain('assembly shutdown observer failed');
  let retained: string | undefined;
  native.worker!.dispose({ stopped: error => { retained = error; } });
  expect(retained).toContain('assembly shutdown observer failed');
});

it('assembly waits for a finished child cleanup and retains its actual refusal', async () => {
  const refusal = 'Native descendant state is unconfirmed; earlier generation effects may be partial or uncertain.';
  activate({ subscriptions: [], asAbsolutePath: (file: string) => '/packaged/' + file } as unknown as ExtensionContext);
  native.worker!.start({ configuration: { file: '/selected/expec.json', writable: true },
    source: { uri: 'file:///main.expec', text: 'type Book { title: Text }' }, version: 1 }, { writeProblems: () => [], finished() {} });
  native.childFeedback!.finished({ report: '{"status":"failed"}', exitCode: 1, error: refusal });
  await Promise.resolve();
  let joined = false, joinedCause: string | undefined, result: unknown;
  native.worker!.dispose({ stopped: error => { joined = true; joinedCause = error; } });
  const stopped = deactivate().then(() => { result = 'completed'; }, error => { result = error; });
  try {
    expect(native.childCompletion).toBeDefined();
    expect(joined).toBe(false);
    native.childCompletion!.stopped(refusal);
    await stopped;
    expect(joined).toBe(true);
    expect(joinedCause).toContain(refusal);
    expect(result).toBeInstanceOf(AggregateError);
    expect((result as AggregateError).errors.map(error => String(error)).join('\n')).toContain(refusal);
    let retained: string | undefined;
    native.worker!.dispose({ stopped: error => { retained = error; } });
    expect(retained).toContain(refusal);
  } finally {
    if (!joined) native.childCompletion?.stopped(undefined);
    await stopped;
  }
});
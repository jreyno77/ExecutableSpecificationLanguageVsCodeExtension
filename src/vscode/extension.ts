import type { ExtensionContext, TreeDataProvider } from 'vscode';
import { workspace, Uri } from 'vscode';
import { resolve } from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from './EditorLanguageSupport.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { OutputPreviewHost } from './OutputPreviewHost.js';
import type { ConnectionState } from '../core/ConnectionState.js';
import { GenerationHost } from './GenerationHost.js';
import { NodeGenerationWorker } from '../core/NodeGenerationWorker.js';
import type { GenerationWorker } from '../core/GenerationWorker.js';
import type { GenerationShutdownFeedback } from '../core/GenerationShutdownFeedback.js';

let client: LanguageClient | undefined;
let support: EditorLanguageSupport | undefined;
let sidebar: ConnectionSidebar | undefined;
let previews: OutputPreviewHost | undefined;
let generation: GenerationHost | undefined;
let stopping: Promise<void> | undefined;

export function activate(context: ExtensionContext): LanguageClient & {
  readonly connectionTreeProvider: TreeDataProvider<ConnectionState>;
} {
  client = new LanguageClient('expec', '.expec', {
    module: context.asAbsolutePath('dist/native/server.cjs'), transport: TransportKind.ipc,
  }, { documentSelector: [{ language: 'expec', scheme: 'file' }, { language: 'expec', scheme: 'untitled' }] });
  previews = new OutputPreviewHost(context, client);
  previews.start();
  support = new EditorLanguageSupport(context, client);
  support.start();
  generation = new GenerationHost(context, generationWorker(context));
  generation.start();
  sidebar = new ConnectionSidebar(context, { configurationChanged: configuration => {
    previews!.configurationChanged(configuration);
    generation!.configurationChanged(configuration);
  } });
  context.subscriptions.push(sidebar, previews);
  const folders = workspace.workspaceFolders ?? [];
  const folder = folders.length === 1 ? folders[0] : undefined;
  if (folder?.uri.scheme === 'file') {
    const setting = workspace.getConfiguration('expec', folder.uri).get<string>('configurationFile', 'expec.json');
    sidebar.start(resolve(folder.uri.fsPath, setting));
  }
  return Object.assign(client, { connectionTreeProvider: sidebar });
}

export function deactivate(): Promise<void> {
  const failures: unknown[] = [];
  try { sidebar?.dispose(); } catch (error) { failures.push(error); }
  try { previews?.dispose(); } catch (error) { failures.push(error); }
  try { support?.dispose(); } catch (error) { failures.push(error); }
  const stopped = client ? stopping ??= client.stop() : Promise.resolve();
  const generated = new Promise<void>((resolveStopped, reject) => {
    if (!generation) { resolveStopped(); return; }
    try { generation.shutdown({ stopped: error => error ? reject(new Error(error)) : resolveStopped() }); }
    catch (error) { reject(error); }
  });
  return Promise.allSettled([stopped, generated]).then(results => {
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
    if (failures.length) throw new AggregateError(failures, '.expec native cleanup failed.');
  });
}

// Adapt the current resource-scoped host setting for each new invocation. Core
// retains process ownership and all admission/scheduling/generation decisions.
function generationWorker(context: ExtensionContext): GenerationWorker {
  let owned: NodeGenerationWorker | undefined;
  let ending = false, ended = false, failure: string | undefined;
  const completions: GenerationShutdownFeedback[] = [];
  const draining = new Set<NodeGenerationWorker>();
  const complete = () => {
    if (ended) return;
    ended = true;
    for (const joined of completions.splice(0)) {
      try { joined.stopped(failure); }
      catch (cause) {
        let message: string;
        try { message = cause instanceof Error ? cause.message : String(cause); }
        catch { message = 'Native shutdown observer failed without a readable cause.'; }
        failure = [failure, 'Generation shutdown callback failed: ' + message].filter(value => value !== undefined).join('\n');
      }
    }
  };
  const settled = () => { if (ending && !owned && !draining.size) complete(); };
  const retire = (worker: NodeGenerationWorker, later = false) => {
    if (draining.has(worker)) return;
    draining.add(worker);
    const observe = () => worker.dispose({ stopped: error => {
      if (!draining.delete(worker)) return;
      if (error !== undefined) failure = [failure, error].filter(value => value !== undefined).join('\n');
      settled();
    } });
    // Result observers may themselves fail; the concrete worker retains that
    // cause after its finished callback unwinds, before this disposal observes it.
    if (later) queueMicrotask(observe); else observe();
  };
  return {
    start(request, feedback) {
      if (ending || owned) throw new Error('Generation worker is unavailable.');
      const scope = Uri.file(request.configuration.file);
      const executable = workspace.getConfiguration('expec', scope).get<string>('nodeExecutable', 'node');
      const worker = owned = new NodeGenerationWorker(executable, context.asAbsolutePath('dist/native/generation-worker.mjs'));
      try {
        worker.start(request, {
          writeProblems: root => feedback.writeProblems(root),
          finished: result => {
            if (owned === worker) owned = undefined;
            retire(worker, true);
            feedback.finished(result);
          },
        });
      } catch (error) {
        if (owned === worker) owned = undefined;
        retire(worker);
        throw error;
      }
    },
    cancel() { owned?.cancel(); },
    dispose(completion) {
      if (ended) { completion.stopped(failure); return; }
      completions.push(completion);
      if (ending) return;
      ending = true;
      if (owned) { const worker = owned; owned = undefined; retire(worker); }
      settled();
    },
  };
}

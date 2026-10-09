import type { ExtensionContext, TreeDataProvider } from 'vscode';
import { workspace } from 'vscode';
import { resolve } from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from './EditorLanguageSupport.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import type { ConnectionState } from '../core/ConnectionState.js';

let client: LanguageClient | undefined;
let support: EditorLanguageSupport | undefined;
let sidebar: ConnectionSidebar | undefined;
let stopping: Promise<void> | undefined;

export function activate(context: ExtensionContext): LanguageClient & {
  readonly connectionTreeProvider: TreeDataProvider<ConnectionState>;
} {
  client = new LanguageClient('expec', '.expec', {
    module: context.asAbsolutePath('dist/native/server.cjs'), transport: TransportKind.ipc,
  }, { documentSelector: [{ language: 'expec', scheme: 'file' }, { language: 'expec', scheme: 'untitled' }] });
  support = new EditorLanguageSupport(context, client);
  support.start();
  sidebar = new ConnectionSidebar(context);
  context.subscriptions.push(sidebar);
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
  try { support?.dispose(); } catch (error) { failures.push(error); }
  const stopped = client ? stopping ??= client.stop() : Promise.resolve();
  return stopped.then(() => {
    if (failures.length) throw new AggregateError(failures, '.expec native cleanup failed.');
  }, error => { throw new AggregateError([...failures, error], '.expec native cleanup failed.'); });
}

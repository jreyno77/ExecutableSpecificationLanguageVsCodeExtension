import type { ExtensionContext } from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from './EditorLanguageSupport.js';

let client: LanguageClient | undefined;
let support: EditorLanguageSupport | undefined;
let stopping: Promise<void> | undefined;

export function activate(context: ExtensionContext): LanguageClient {
  client = new LanguageClient('expec', '.expec', {
    module: context.asAbsolutePath('dist/native/server.cjs'), transport: TransportKind.ipc,
  }, { documentSelector: [{ language: 'expec', scheme: 'file' }, { language: 'expec', scheme: 'untitled' }] });
  support = new EditorLanguageSupport(context, client);
  support.start();
  return client;
}

export function deactivate(): Promise<void> | undefined {
  support?.dispose();
  return client ? stopping ??= client.stop() : undefined;
}

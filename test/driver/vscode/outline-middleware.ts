import { onTestFinished } from 'vitest';
import { CancellationToken } from 'vscode-languageserver/node';
import type { DocumentSymbol, ExtensionContext, TextDocument, Uri } from 'vscode';
import type { LanguageClient, Middleware } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from '../../../src/vscode/EditorLanguageSupport.js';
import { workspace } from '../../resources/vscode/recorded-language-api.js';

type OutlineMiddleware = NonNullable<Middleware['provideDocumentSymbols']>;
class RecordedOutlineDocument {
  version = 1;
  isClosed = false;
  readonly uri: Uri;
  readonly languageId = 'expec';
  constructor(uri: string) { this.uri = { toString: () => uri } as Uri; }
  native(): TextDocument { return this as unknown as TextDocument; }
}

/** Native continuation/lifetime recorder only; no declaration or language model. */
export function recordedOutlines(previous?: OutlineMiddleware) {
  const source = new RecordedOutlineDocument('file:///workspace/library.expec');
  const other = new RecordedOutlineDocument('file:///workspace/other.expec');
  workspace.textDocuments = [source.native(), other.native()];
  const middleware: Middleware = { provideDocumentSymbols: previous };
  const subscriptions: ExtensionContext['subscriptions'] = [];
  let starts = 0, stops = 0;
  const client = { clientOptions: { middleware }, start: () => { starts++; return Promise.resolve(); },
    stop: () => { stops++; return Promise.resolve(); }, error: () => {} } as unknown as LanguageClient;
  const adapter = new EditorLanguageSupport({ subscriptions } as ExtensionContext, client);
  adapter.start();
  onTestFinished(() => { adapter.dispose(); workspace.textDocuments = []; });
  const actualSymbols = [{ name: 'Actual native continuation', kind: 1, range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
    selectionRange: { start: { line: 0, character: 10 }, end: { line: 0, character: 17 } }, children: [] }] as unknown as DocumentSymbol[];
  return {
    adapter, middleware, source, other, actualSymbols, subscriptions,
    starts: () => starts, stops: () => stops,
    close: () => { source.isClosed = true; workspace.textDocuments = workspace.textDocuments.filter(document => document !== source.native()); },
    replace: () => { const replacement = new RecordedOutlineDocument(source.uri.toString()); replacement.version = source.version;
      workspace.textDocuments = workspace.textDocuments.map(document => document === source.native() ? replacement.native() : document); },
    pending: (token = CancellationToken.None) => {
      let release!: (reply: DocumentSymbol[]) => void, entered!: () => void;
      const response = new Promise<DocumentSymbol[]>(resolve => { release = resolve; });
      const requested = new Promise<void>(resolve => { entered = resolve; });
      const next: Parameters<OutlineMiddleware>[2] = () => { entered(); return response; };
      const result = Promise.resolve().then(() => middleware.provideDocumentSymbols
        ? middleware.provideDocumentSymbols(source.native(), token, next) : next(source.native(), token));
      return { result, requested, complete: () => release(actualSymbols) };
    },
  };
}

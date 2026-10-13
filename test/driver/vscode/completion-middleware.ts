import { onTestFinished } from 'vitest';
import { CancellationToken } from 'vscode-languageserver/node';
import type { CompletionItem, ExtensionContext, TextDocument, Uri } from 'vscode';
import type { LanguageClient, Middleware } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from '../../../src/vscode/EditorLanguageSupport.js';
import { workspace } from '../../resources/vscode/recorded-language-api.js';

type CompletionMiddleware = NonNullable<Middleware['provideCompletionItem']>;
class RecordedCompletionDocument {
  version = 1;
  isClosed = false;
  readonly uri: Uri;
  constructor(uri: string, readonly languageId = 'expec') { this.uri = { toString: () => uri } as Uri; }
  native(): TextDocument { return this as unknown as TextDocument; }
}

/** Native continuation and buffer-lifetime observations; no scope or language model. */
export function recordedCompletions(previous?: CompletionMiddleware) {
  const source = new RecordedCompletionDocument('file:///workspace/library.expec');
  const other = new RecordedCompletionDocument('file:///workspace/other.expec');
  const notes = new RecordedCompletionDocument('file:///workspace/notes.txt', 'plaintext');
  workspace.textDocuments = [source.native(), other.native(), notes.native()];
  const middleware: Middleware = { provideCompletionItem: previous };
  const subscriptions: ExtensionContext['subscriptions'] = [];
  let starts = 0, stops = 0;
  const client = { clientOptions: { middleware }, start: () => { starts++; return Promise.resolve(); },
    stop: () => { stops++; return Promise.resolve(); }, error: () => {} } as unknown as LanguageClient;
  const adapter = new EditorLanguageSupport({ subscriptions } as ExtensionContext, client);
  adapter.start();
  onTestFinished(() => { adapter.dispose(); workspace.textDocuments = []; });
  const actualItems = [{ label: 'Actual native continuation', insertText: 'its real text' }] as CompletionItem[];
  return {
    adapter, middleware, source, other, notes, actualItems, subscriptions,
    starts: () => starts, stops: () => stops,
    close: (document = source) => { document.isClosed = true; workspace.textDocuments = workspace.textDocuments.filter(open => open !== document.native()); },
    replace: (document = source) => { const replacement = new RecordedCompletionDocument(document.uri.toString()); replacement.version = document.version;
      workspace.textDocuments = workspace.textDocuments.map(open => open === document.native() ? replacement.native() : open); },
    pending: (token = CancellationToken.None) => {
      let release!: (reply: CompletionItem[]) => void, entered!: () => void;
      const response = new Promise<CompletionItem[]>(resolve => { release = resolve; });
      const requested = new Promise<void>(resolve => { entered = resolve; });
      const continuationArgs: Array<Parameters<Parameters<CompletionMiddleware>[4]>> = [];
      const next: Parameters<CompletionMiddleware>[4] = (...args) => { continuationArgs.push(args); entered(); return response; };
      const position = { line: 1, character: 23 } as Parameters<CompletionMiddleware>[1];
      const context = { triggerKind: 0 } as Parameters<CompletionMiddleware>[2];
      const result = Promise.resolve().then(() => middleware.provideCompletionItem
        ? middleware.provideCompletionItem(source.native(), position, context, token, next) : next(source.native(), position, context, token));
      return { result, requested, position, context, token, next, continuationArgs, complete: () => release(actualItems) };
    },
  };
}
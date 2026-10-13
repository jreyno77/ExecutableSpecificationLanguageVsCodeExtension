import { onTestFinished } from 'vitest';
import { CancellationToken } from 'vscode-languageserver/node';
import type { ExtensionContext, Location, TextDocument, Uri } from 'vscode';
import type { LanguageClient, Middleware } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from '../../../src/vscode/EditorLanguageSupport.js';
import { workspace } from '../../resources/vscode/recorded-language-api.js';

type ReferencesMiddleware = NonNullable<Middleware['provideReferences']>;
class RecordedReferenceDocument {
  version = 1;
  isClosed = false;
  readonly uri: Uri;
  constructor(uri: string, readonly languageId = 'expec') { this.uri = { toString: () => uri } as Uri; }
  native(): TextDocument { return this as unknown as TextDocument; }
}

/** Records public native operands, replies and buffer lifetimes without a language model. */
export function recordedReferences(previous?: ReferencesMiddleware) {
  const source = new RecordedReferenceDocument('file:///workspace/library.expec');
  const other = new RecordedReferenceDocument('file:///workspace/import.expec');
  const notes = new RecordedReferenceDocument('file:///workspace/notes.txt', 'plaintext');
  workspace.textDocuments = [source.native(), other.native(), notes.native()];
  const middleware: Middleware = { provideReferences: previous };
  const subscriptions: ExtensionContext['subscriptions'] = [];
  const client = { clientOptions: { middleware }, start: () => Promise.resolve(), error: () => {} } as unknown as LanguageClient;
  const adapter = new EditorLanguageSupport({ subscriptions } as ExtensionContext, client);
  adapter.start();
  onTestFinished(() => { adapter.dispose(); workspace.textDocuments = []; });
  const actualLocations = [{ uri: other.uri, range: { start: { line: 3, character: 5 }, end: { line: 3, character: 9 } } }] as Location[];
  return {
    adapter, middleware, source, other, notes, actualLocations,
    close: (document = source) => { document.isClosed = true; workspace.textDocuments = workspace.textDocuments.filter(open => open !== document.native()); },
    replace: (document = source) => {
      const replacement = new RecordedReferenceDocument(document.uri.toString()); replacement.version = document.version;
      workspace.textDocuments = workspace.textDocuments.map(open => open === document.native() ? replacement.native() : open);
    },
    pending: (includeDeclaration = false, token = CancellationToken.None) => {
      let release!: (reply: Location[]) => void, entered!: () => void;
      const response = new Promise<Location[]>(resolve => { release = resolve; });
      const requested = new Promise<void>(resolve => { entered = resolve; });
      const continuationArgs: Array<Parameters<Parameters<ReferencesMiddleware>[4]>> = [];
      const next: Parameters<ReferencesMiddleware>[4] = (...args) => { continuationArgs.push(args); entered(); return response; };
      const position = { line: 1, character: 23 } as Parameters<ReferencesMiddleware>[1], context = { includeDeclaration };
      const result = Promise.resolve().then(() => middleware.provideReferences
        ? middleware.provideReferences(source.native(), position, context, token, next) : next(source.native(), position, context, token));
      return { result, requested, position, context, token, next, continuationArgs, complete: () => release(actualLocations) };
    },
  };
}


import { onTestFinished } from 'vitest';
import { CancellationToken } from 'vscode-languageserver/node';
import type { ExtensionContext, Location, LocationLink, TextDocument, Uri } from 'vscode';
import type { LanguageClient, Middleware } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from '../../../src/vscode/EditorLanguageSupport.js';
import { workspace } from '../../resources/vscode/recorded-language-api.js';

type DefinitionMiddleware = NonNullable<Middleware['provideDefinition']>;
type DefinitionResult = Location | Location[] | LocationLink[] | null | undefined;
export class RecordedDefinitionDocument {
  version = 1;
  isClosed = false;
  readonly uri: Uri;
  constructor(uri: string) { this.uri = { toString: () => uri } as Uri; }
  native(): TextDocument { return this as unknown as TextDocument; }
}

/** Holds the native continuation's actual reply to exercise the real adapter's lifetime checks. */
export function recordedDefinitions(previous?: DefinitionMiddleware) {
  const source = new RecordedDefinitionDocument('file:///workspace/catalog.expec');
  const target = new RecordedDefinitionDocument('file:///workspace/book.expec');
  const unrelated = new RecordedDefinitionDocument('file:///workspace/notes.expec');
  workspace.textDocuments = [source.native(), target.native(), unrelated.native()];
  const middleware: Middleware = { provideDefinition: previous };
  const subscriptions: ExtensionContext['subscriptions'] = [];
  let starts = 0, stops = 0;
  const client = { clientOptions: { middleware },
    start: () => { starts++; return Promise.resolve(); },
    stop: () => { stops++; return Promise.resolve(); }, error: () => {} } as unknown as LanguageClient;
  const adapter = new EditorLanguageSupport({ subscriptions } as ExtensionContext, client);
  adapter.start();
  onTestFinished(() => { adapter.dispose(); workspace.textDocuments = []; });
  const actualLocation: Location = { uri: target.uri,
    range: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } } } as Location;
  const actualLink: LocationLink = { targetUri: target.uri,
    targetRange: actualLocation.range, targetSelectionRange: actualLocation.range };
  return {
    adapter, middleware, source, target, unrelated, actualLocation, actualLink, subscriptions,
    starts: () => starts, stops: () => stops,
    close: (document: RecordedDefinitionDocument) => { document.isClosed = true; workspace.textDocuments = workspace.textDocuments.filter(open => open !== document.native()); },
    replace: (document: RecordedDefinitionDocument) => {
      const replacement = new RecordedDefinitionDocument(document.uri.toString());
      replacement.version = document.version;
      workspace.textDocuments = workspace.textDocuments.map(open => open === document.native() ? replacement.native() : open);
      return replacement;
    },
    pending: (token = CancellationToken.None) => {
      let release!: (value: DefinitionResult) => void, entered!: () => void;
      const response = new Promise<DefinitionResult>(resolve => { release = resolve; });
      const requested = new Promise<void>(resolve => { entered = resolve; });
      const next: Parameters<DefinitionMiddleware>[3] = () => { entered(); return response; };
      const position = { line: 1, character: 20 } as Parameters<DefinitionMiddleware>[1];
      // The public client continuation runs directly when no middleware was installed.
      const result = Promise.resolve().then(() => middleware.provideDefinition
        ? middleware.provideDefinition(source.native(), position, token, next)
        : next(source.native(), position, token));
      return { result, requested, complete: (value: DefinitionResult = actualLocation) => release(value) };
    },
  };
}

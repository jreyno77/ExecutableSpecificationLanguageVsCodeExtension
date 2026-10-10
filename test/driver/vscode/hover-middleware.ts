import { onTestFinished } from 'vitest';
import { CancellationToken } from 'vscode-languageserver/node';
import type { ExtensionContext, Hover, TextDocument, Uri } from 'vscode';
import type { LanguageClient, Middleware } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from '../../../src/vscode/EditorLanguageSupport.js';
import { workspace } from '../../resources/vscode/recorded-language-api.js';

type HoverMiddleware = NonNullable<Middleware['provideHover']>;
export class RecordedHoverDocument {
  version = 1;
  isClosed = false;
  readonly uri: Uri;
  constructor(uri: string, readonly languageId = 'expec') { this.uri = { toString: () => uri } as Uri; }
  native(): TextDocument { return this as unknown as TextDocument; }
}

/** Holds a native continuation's actual reply; it supplies no language or hover analysis. */
export function recordedHovers(previous?: HoverMiddleware) {
  const source = new RecordedHoverDocument('file:///workspace/catalog.expec');
  const imported = new RecordedHoverDocument('file:///workspace/book.expec');
  const ordinary = new RecordedHoverDocument('file:///workspace/notes.md', 'markdown');
  workspace.textDocuments = [source.native(), imported.native(), ordinary.native()];
  const middleware: Middleware = { provideHover: previous };
  const subscriptions: ExtensionContext['subscriptions'] = [];
  let starts = 0, stops = 0;
  const client = { clientOptions: { middleware },
    start: () => { starts++; return Promise.resolve(); }, stop: () => { stops++; return Promise.resolve(); },
    error: () => {} } as unknown as LanguageClient;
  const adapter = new EditorLanguageSupport({ subscriptions } as ExtensionContext, client);
  adapter.start();
  onTestFinished(() => { adapter.dispose(); workspace.textDocuments = []; });
  const actualHover = { contents: [{ value: 'Native continuation reply.' }],
    range: { start: { line: 1, character: 20 }, end: { line: 1, character: 24 } } } as Hover;
  return {
    adapter, middleware, source, imported, ordinary, actualHover, subscriptions,
    starts: () => starts, stops: () => stops,
    close: (document: RecordedHoverDocument) => {
      document.isClosed = true; workspace.textDocuments = workspace.textDocuments.filter(open => open !== document.native());
    },
    replace: (document: RecordedHoverDocument) => {
      const replacement = new RecordedHoverDocument(document.uri.toString(), document.languageId);
      replacement.version = document.version;
      workspace.textDocuments = workspace.textDocuments.map(open => open === document.native() ? replacement.native() : open);
      return replacement;
    },
    pending: (token = CancellationToken.None) => {
      let release!: (value: Hover | null | undefined) => void, entered!: () => void;
      const response = new Promise<Hover | null | undefined>(resolve => { release = resolve; });
      const requested = new Promise<void>(resolve => { entered = resolve; });
      const next: Parameters<HoverMiddleware>[3] = () => { entered(); return response; };
      const position = { line: 1, character: 21 } as Parameters<HoverMiddleware>[1];
      // Without middleware the public client continuation is called directly.
      const result = Promise.resolve().then(() => middleware.provideHover
        ? middleware.provideHover(source.native(), position, token, next)
        : next(source.native(), position, token));
      return { result, requested, complete: (value: Hover | null | undefined = actualHover) => release(value) };
    },
  };
}

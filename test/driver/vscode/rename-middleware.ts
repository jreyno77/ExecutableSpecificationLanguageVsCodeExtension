import { onTestFinished } from 'vitest';
import { CancellationToken } from 'vscode-languageserver/node';
import type { ExtensionContext, TextDocument, Uri, WorkspaceEdit, Range } from 'vscode';
import type { LanguageClient, Middleware } from 'vscode-languageclient/node';
import { EditorLanguageSupport } from '../../../src/vscode/EditorLanguageSupport.js';
import { previewChannel } from '../../../src/vscode/output-preview-channel.js';
import { workspace } from '../../resources/vscode/recorded-language-api.js';

class RenameDocument {
  version = 1; isClosed = false; readonly uri: Uri;
  constructor(uri: string, readonly languageId = 'expec') { this.uri = { toString: () => uri } as Uri; }
  native(): TextDocument { return this as unknown as TextDocument; }
}
/** Owns only native documents, asynchronous continuations and public middleware operands. */
export function recordedRename(previous: Middleware = {}) {
  const source = new RenameDocument('file:///workspace/book.expec'), other = new RenameDocument('file:///workspace/basket.expec');
  const notes = new RenameDocument('file:///workspace/notes.txt', 'plaintext');
  workspace.textDocuments = [source.native(), other.native(), notes.native()];
  const middleware: Middleware = { ...previous };
  const client = { clientOptions: { middleware }, start: () => Promise.resolve(), error: () => {} } as unknown as LanguageClient;
  const adapter = new EditorLanguageSupport({ subscriptions: [] } as unknown as ExtensionContext, client); adapter.start();
  onTestFinished(() => { adapter.dispose(); workspace.textDocuments = []; });
  const actualTarget = { range: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } } as Range, placeholder: 'Book' };
  const actualEdit = { entries: () => [] } as unknown as WorkspaceEdit;
  return { source, other, notes, middleware, adapter, actualTarget, actualEdit,
    close: (document = source) => { document.isClosed = true; workspace.textDocuments = workspace.textDocuments.filter(open => open !== document.native()); },
    replace: (document = source) => { const replacement = new RenameDocument(document.uri.toString()); replacement.version = document.version; workspace.textDocuments = workspace.textDocuments.map(open => open === document.native() ? replacement.native() : open); },
    configuration: async (method: string = previewChannel.configuration) => {
      const operands: unknown[][] = [], params = { configuration: { file: 'file:///workspace/expec.json', text: '{}', writable: false } };
      const next = async (...args: unknown[]) => { operands.push(args); };
      if (middleware.sendNotification) await middleware.sendNotification(method, next, params); else await next(method, params);
      return { operands, params, next };
    },
    pending: (feature: 'prepare' | 'rename', token = CancellationToken.None) => {
      let release!: (reply: unknown) => void, entered!: () => void;
      const response = new Promise<unknown>(resolve => { release = resolve; }), requested = new Promise<void>(resolve => { entered = resolve; });
      const continuationArgs: unknown[][] = [], position = { line: 0, character: 6 } as Parameters<NonNullable<Middleware['prepareRename']>>[1];
      const next = (...args: unknown[]) => { continuationArgs.push(args); entered(); return response; };
      const prepareNext = next as Parameters<NonNullable<Middleware['prepareRename']>>[3];
      const renameNext = next as Parameters<NonNullable<Middleware['provideRenameEdits']>>[4];
      const newName = 'Publication 📚';
      const result = Promise.resolve().then(() => feature === 'prepare'
        ? middleware.prepareRename ? middleware.prepareRename(source.native(), position, token, prepareNext) : prepareNext(source.native(), position, token)
        : middleware.provideRenameEdits ? middleware.provideRenameEdits(source.native(), position, newName, token, renameNext) : renameNext(source.native(), position, newName, token));
      return { result, requested, position, token, newName, next, continuationArgs, complete: () => release(feature === 'prepare' ? actualTarget : actualEdit) };
    },
  };
}

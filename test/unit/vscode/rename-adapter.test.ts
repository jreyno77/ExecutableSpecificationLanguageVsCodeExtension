import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LSPErrorCodes, ResponseError } from 'vscode-languageserver';
import { SourceRenameAdapter } from '../../../src/vscode/SourceRenameAdapter.js';
import type { SourceRename } from '../../../src/core/SourceRename.js';
import type { RenameTarget } from '../../../src/core/RenameTarget.js';
import type { RenameDocumentEdit } from '../../../src/core/RenameDocumentEdit.js';

function caller(text = '// 📚\ntype Book {}') {
  const document = TextDocument.create('file:///workspace/book.expec', 'expec', 7, text);
  const prepared: unknown[][] = [], renamed: unknown[][] = [];
  const source = { uri: document.uri, text };
  let target: RenameTarget = { name: 'Book', location: { source, startOffset: 10, endOffset: 14 } };
  let changes: RenameDocumentEdit[] = [{ source, version: 7, edits: [{ startOffset: 10, endOffset: 14, newText: 'Publication' }] }];
  let refusal: Error | undefined;
  const core = {
    prepare: (...args: unknown[]) => { prepared.push(args); if (refusal) throw refusal; return target; },
    rename: (...args: unknown[]) => { renamed.push(args); if (refusal) throw refusal; return changes; },
  } as unknown as SourceRename;
  return { document, prepared, renamed, adapter: new SourceRenameAdapter(core),
    target: (value: RenameTarget) => { target = value; },
    changes: (value: RenameDocumentEdit[]) => { changes = value; },
    refuse: (error: Error) => { refusal = error; } };
}

describe('standard rename protocol conversion', () => {
  it('prepares the whole token using the exact UTF-16 cursor and scalar core request', () => {
    const host = caller();
    expect(host.adapter.prepare(host.document, { line: 1, character: 6 })).toEqual({
      range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } }, placeholder: 'Book' });
    expect(host.prepared).toEqual([[host.document.uri, 7, 11]]);
  });
  it('returns ordered versioned edits and saved-only null versions without applying them', () => {
    const host = caller();
    host.changes([
      { source: { uri: 'file:///workspace/basket.expec', text: 'type Basket { book: Book }' }, edits: [{ startOffset: 20, endOffset: 24, newText: 'Publication' }] },
      { source: { uri: host.document.uri, text: host.document.getText() }, version: 7, edits: [{ startOffset: 10, endOffset: 14, newText: 'Publication' }] },
    ]);
    expect(host.adapter.rename(host.document, { line: 1, character: 6 }, 'Publication')).toEqual({ documentChanges: [
      { textDocument: { uri: 'file:///workspace/basket.expec', version: null }, edits: [{ range: { start: { line: 0, character: 20 }, end: { line: 0, character: 24 } }, newText: 'Publication' }] },
      { textDocument: { uri: host.document.uri, version: 7 }, edits: [{ range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } }, newText: 'Publication' }] },
    ] });
    expect(host.renamed).toEqual([[host.document.uri, 7, 11, 'Publication']]);
    expect(host.document.getText()).toBe('// 📚\ntype Book {}');
  });
  it('forwards the decoded replacement unchanged', () => {
    const host = caller(); host.changes([]);
    expect(host.adapter.rename(host.document, { line: 1, character: 5 }, ' Publication 📚 ')).toEqual({ documentChanges: [] });
    expect(host.renamed).toEqual([[host.document.uri, 7, 10, ' Publication 📚 ']]);
  });
  it('rejects a cursor splitting a surrogate before calling core', () => {
    const host = caller();
    expect(() => host.adapter.prepare(host.document, { line: 0, character: 4 })).toThrow();
    expect(host.prepared).toEqual([]);
  });
  it('rejects a clamped out-of-line cursor before calling core', () => {
    const host = caller();
    expect(() => host.adapter.rename(host.document, { line: 1, character: 100 }, 'Title')).toThrow();
    expect(host.renamed).toEqual([]);
  });
  it('rejects fractional native coordinates before calling core', () => {
    const host = caller();
    expect(() => host.adapter.prepare(host.document, { line: 1, character: 5.5 })).toThrow();
    expect(host.prepared).toEqual([]);
  });
  it('refuses a prepared token from a different captured source', () => {
    const host = caller(); host.target({ name: 'Book', location: { source: { uri: host.document.uri, text: 'type Book {}' }, startOffset: 5, endOffset: 9 } });
    expect(() => host.adapter.prepare(host.document, { line: 1, character: 5 })).toThrow();
  });
  it('refuses the complete plan if the affected requester has a stale version', () => {
    const host = caller(); host.changes([{ source: { uri: host.document.uri, text: host.document.getText() }, version: 6, edits: [{ startOffset: 10, endOffset: 14, newText: 'Title' }] }]);
    expect(() => host.adapter.rename(host.document, { line: 1, character: 5 }, 'Title')).toThrow();
  });
  it('refuses duplicate document edits instead of returning a partial plan', () => {
    const host = caller(), source = { uri: 'file:///workspace/other.expec', text: 'Book' };
    host.changes([{ source, edits: [{ startOffset: 0, endOffset: 4, newText: 'Title' }] }, { source, edits: [] }]);
    expect(() => host.adapter.rename(host.document, { line: 1, character: 5 }, 'Title')).toThrow();
  });
  it('refuses an out-of-bounds scalar edit', () => {
    const host = caller(); host.changes([{ source: { uri: 'file:///workspace/other.expec', text: 'Book' }, edits: [
      { startOffset: 0, endOffset: 4, newText: 'Title' }, { startOffset: 3, endOffset: 5, newText: 'Title' },
    ] }]);
    expect(() => host.adapter.rename(host.document, { line: 1, character: 5 }, 'Title')).toThrow();
  });
  it('refuses overlapping edits whose boundaries are all inside the captured source', () => {
    const host = caller(); host.changes([{ source: { uri: 'file:///workspace/other.expec', text: 'Book' }, edits: [
      { startOffset: 0, endOffset: 3, newText: 'Title' }, { startOffset: 2, endOffset: 4, newText: 'Title' },
    ] }]);
    expect(() => host.adapter.rename(host.document, { line: 1, character: 5 }, 'Title')).toThrow('overlapping');
  });
  it('refuses a scalar range that native CRLF positions would silently clamp', () => {
    const host = caller(); host.changes([{ source: { uri: 'file:///workspace/other.expec', text: 'Book\r\n' }, edits: [
      { startOffset: 4, endOffset: 5, newText: 'X' },
    ] }]);
    expect(() => host.adapter.rename(host.document, { line: 1, character: 5 }, 'Title')).toThrow();
  });
  it('surfaces the actual core explanation as standard RequestFailed', () => {
    const host = caller(); host.refuse(new Error('Publication would capture another binding'));
    expect(() => host.adapter.rename(host.document, { line: 1, character: 5 }, 'Publication')).toThrow('Publication would capture another binding');
    try { host.adapter.prepare(host.document, { line: 1, character: 5 }); throw new Error('expected refusal'); }
    catch (error) { expect(error).toBeInstanceOf(ResponseError); expect((error as ResponseError<unknown>).code).toBe(LSPErrorCodes.RequestFailed); }
  });
});

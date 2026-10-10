import { describe, expect, it, vi } from 'vitest';
import { InsertTextFormat } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SourceCompletion } from '../../../src/core/SourceCompletion.js';
import type { TypeCompletion } from '../../../src/core/TypeCompletion.js';
import { SourceCompletionAdapter } from '../../../src/vscode/SourceCompletionAdapter.js';

const source = { uri: 'file:///workspace/catalog.expec', text: 'type Book {}\r\ntype Basket { book: `📚N` }' };
const position = { line: 1, character: 25 };
function completionReply(): TypeCompletion {
  return { source: { ...source }, startOffset: 34, endOffset: 38,
    suggestions: [{ spelling: '📚Novel', insertionText: '`📚Novel`', targetName: 'Book' }] };
}
function conversion(reply: TypeCompletion) {
  const core = new SourceCompletion();
  const query = vi.spyOn(core, 'completion').mockReturnValue(reply);
  const document = TextDocument.create(source.uri, 'expec', 7, source.text);
  return { query, document, adapter: new SourceCompletionAdapter(core) };
}

describe('completion conversion for a native protocol caller', () => {
  it('asks core once with the exact scalar position and preserves its plain alias edit', () => {
    const caller = conversion(completionReply());

    const items = caller.adapter.items(caller.document, position);

    expect(caller.query).toHaveBeenCalledTimes(1);
    expect(caller.query).toHaveBeenCalledWith('file:///workspace/catalog.expec', 7, 38);
    expect(items).toEqual([{ label: '📚Novel', detail: 'Book', insertTextFormat: InsertTextFormat.PlainText,
      textEdit: { range: { start: { line: 1, character: 20 }, end: { line: 1, character: 25 } }, newText: '`📚Novel`' } }]);
    expect(Object.keys(items[0]!).sort()).toEqual(['detail', 'insertTextFormat', 'label', 'textEdit']);
  });

  it('refuses a reply captured for a different URI', () => {
    const reply = completionReply();
    reply.source.uri = 'file:///workspace/other.expec';
    const caller = conversion(reply);

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a reply captured from different source text', () => {
    const reply = completionReply();
    reply.source.text = 'type Other {}';
    const caller = conversion(reply);

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a fractional scalar start rather than clamping it into a token', () => {
    const caller = conversion({ ...completionReply(), startOffset: 34.5 });

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a negative scalar start rather than widening the edit', () => {
    const caller = conversion({ ...completionReply(), startOffset: -1 });

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a reversed scalar replacement range', () => {
    const caller = conversion({ ...completionReply(), startOffset: 38, endOffset: 34 });

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a scalar replacement outside the captured source', () => {
    const caller = conversion({ ...completionReply(), endOffset: 999 });

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a replacement spanning source lines even when it contains the request', () => {
    const caller = conversion({ ...completionReply(), startOffset: 0, endOffset: 38 });

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });

  it('refuses a valid single-line range that does not contain the requested position', () => {
    const caller = conversion({ ...completionReply(), startOffset: 0, endOffset: 4 });

    expect(caller.adapter.items(caller.document, position)).toEqual([]);
  });
});

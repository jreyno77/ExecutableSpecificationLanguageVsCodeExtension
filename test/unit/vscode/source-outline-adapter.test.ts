import { expect, it, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentOutline } from '../../../src/core/DocumentOutline.js';
import type { SourceOutline } from '../../../src/core/SourceOutline.js';
import { SourceOutlineAdapter } from '../../../src/vscode/SourceOutlineAdapter.js';
import { SourceOutlineConversion } from '../../driver/source-outline-conversion.js';

const document = TextDocument.create('file:///workspace/book.expec', 'expec', 3, 'type Book { title: Text }');
const reply = (): SourceOutline => ({ source: { uri: document.uri, text: document.getText() }, symbols: [{
  name: 'Book', kind: 'record-type-declaration', startOffset: 0, endOffset: 25,
  nameStartOffset: 5, nameEndOffset: 9, children: [],
}] });
function port(actual: SourceOutline | undefined) {
  const query = vi.fn(() => actual);
  return { query, adapter: new SourceOutlineAdapter({ symbols: query } as unknown as DocumentOutline) };
}

it('asks the supplied current outline exactly once with the native URI and version', () => {
  const caller = port(reply());
  expect(caller.adapter.symbols(document)).toMatchObject([{ name: 'Book', selectionRange: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } } }]);
  expect(caller.query.mock.calls).toEqual([[document.uri, 3]]);
});

it('maps the actual authored language kinds to standard native presentation kinds', () => {
  const caller = new SourceOutlineConversion('file:///workspace/kinds.expec', 'component Library {\n  local type Book {\n    title: Text\n  }\n  public count\n  capability count() returns Number\n}\nconcept Named {}\nclass Shelf {}\ninterface Catalog {}\ntype Name = Text\nopaque type Handle\nfunction describe(value: Text) returns Text\nexamples for describe {}', 1);
  caller.request(1);
  expect(caller.replies.reply(1).map(symbol => [symbol.name, symbol.kind])).toEqual([
    ['Library', 'Module'], ['Named', 'Object'], ['Shelf', 'Class'], ['Catalog', 'Interface'],
    ['Name', 'Class'], ['Handle', 'Class'], ['describe', 'Function'],
  ]);
  expect(caller.replies.reply(1)[0].children.map(symbol => [symbol.name, symbol.kind])).toEqual([['Book', 'Struct'], ['count', 'Method']]);
  expect(caller.replies.reply(1)[0].children[0].children.map(symbol => [symbol.name, symbol.kind])).toEqual([['title', 'Field']]);
});

it('keeps absence and mismatched captured text from becoming a native outline', () => {
  expect(port(undefined).adapter.symbols(document)).toEqual([]);
  const actual = reply(); actual.source.text = 'type Magazine { title: Text }';
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

it('refuses an outline captured for a different native URI', () => {
  const actual = reply(); actual.source.uri = 'file:///workspace/other.expec';
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

it('refuses an otherwise valid declaration whose public kind is constructor', () => {
  const actual = reply(); actual.symbols[0].kind = 'constructor';
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

it('refuses an otherwise valid declaration whose public kind is toString', () => {
  const actual = reply(); actual.symbols[0].kind = 'toString';
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

it('omits a whitespace-only name and its subtree while retaining valid siblings', () => {
  const actual = reply(), valid = actual.symbols[0];
  actual.symbols.unshift({ ...valid, name: ' \t ', children: [{ ...valid, name: 'must not be promoted' }] });
  expect(port(actual).adapter.symbols(document)).toMatchObject([{ name: 'Book', children: [] }]);
});

it('refuses a fractional scalar name offset instead of clamping it', () => {
  const actual = reply(); actual.symbols[0].nameStartOffset = 5.5;
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

it('refuses a whole declaration outside its captured text', () => {
  const actual = reply(); actual.symbols[0].endOffset = 999;
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

it('refuses a name selection outside its whole declaration', () => {
  const actual = reply(); actual.symbols[0].nameStartOffset = 0; actual.symbols[0].startOffset = 5;
  expect(port(actual).adapter.symbols(document)).toEqual([]);
});

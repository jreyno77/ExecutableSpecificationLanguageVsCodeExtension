import { QueryError } from 'executable-specification-language';
import { describe, expect, it } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';
import { SourceCompletion } from '../../../src/core/SourceCompletion.js';

const source = { uri: 'file:///workspace/catalog.expec', text: 'type Book {}\ntype Basket { book: Boo }' };
const tokenStart = 33, tokenEnd = 36;
function reportFor(input: SourceDocument): DocumentReport {
  let captured: DocumentReport | undefined;
  const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { captured = report; }, clear: () => {} }, { read: () => undefined });
  analysis.opened(input, 1);
  if (!captured) throw new Error('The actual DocumentAnalysis did not publish.');
  return captured;
}
describe('type completion for its plain caller', () => {
  it('rejects invalid versions and offsets without replacing current suggestions', () => {
    const completions = new SourceCompletion(), report = reportFor(source);
    completions.published(source, 0, report);
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => completions.published(source, invalid, { ...report, resolution: undefined })).toThrow(RangeError);
      expect(() => completions.completion(source.uri, invalid, tokenEnd)).toThrow(RangeError);
      expect(() => completions.completion(source.uri, 0, invalid)).toThrow(RangeError);
    }
    expect(completions.completion(source.uri, 0, tokenStart)?.suggestions).toEqual([{ spelling: 'Book', insertionText: 'Book', targetName: 'Book' },
      { spelling: 'Boolean', insertionText: 'Boolean', targetName: 'Boolean' }]);
    expect(completions.completion(source.uri, 0, tokenEnd)?.startOffset).toBe(tokenStart);
    expect(completions.completion(source.uri, 0, tokenEnd)?.endOffset).toBe(tokenEnd);
    expect(completions.completion(source.uri, 0, tokenEnd + 1)).toBeUndefined();
    expect(completions.completion(source.uri, 0, source.text.length + 1)).toBeUndefined();
  });
  it('withdraws facts when the current publication lacks its resolution or inspection', () => {
    const completions = new SourceCompletion(), report = reportFor(source);
    completions.published(source, 1, report);
    expect(completions.completion(source.uri, 1, tokenEnd)?.suggestions[0]?.spelling).toBe('Book');
    completions.published(source, 1, { ...report, resolution: undefined });
    expect(completions.completion(source.uri, 1, tokenEnd)).toBeUndefined();
    completions.published(source, 1, report);
    completions.published(source, 1, { ...report, inspection: undefined });
    expect(completions.completion(source.uri, 1, tokenEnd)).toBeUndefined();
  });
  it('surfaces genuine mismatched SDK evidence after withdrawing the old facts', () => {
    const completions = new SourceCompletion(), report = reportFor(source);
    const foreign = reportFor({ uri: 'file:///workspace/foreign.expec', text: source.text });
    completions.published(source, 1, report);
    expect(completions.completion(source.uri, 1, tokenEnd)?.suggestions[0]?.spelling).toBe('Book');
    expect(() => completions.published(source, 1, { ...report, resolution: foreign.resolution })).toThrow(QueryError);
    expect(completions.completion(source.uri, 1, tokenEnd)).toBeUndefined();
  });
  it('protects retained replies and closes only the requested document lifetime', () => {
    const completions = new SourceCompletion(), other = { ...source, uri: 'file:///workspace/other.expec' };
    const report = reportFor(source);
    completions.published(source, 10, report); completions.published(other, 1, reportFor(other));
    const actual = completions.completion(source.uri, 10, tokenEnd)!;
    expect(actual.suggestions[0]?.spelling).toBe('Book');
    const attempt = (change: () => void) => { try { change(); } catch (error) { if (!(error instanceof TypeError)) throw error; } };
    attempt(() => { actual.source.text = 'caller changed source'; });
    attempt(() => { actual.suggestions[0]!.insertionText = 'caller changed insertion'; });
    attempt(() => { actual.suggestions.length = 0; });
    expect(completions.completion(source.uri, 10, tokenEnd)).toEqual({ source, startOffset: tokenStart, endOffset: tokenEnd,
      suggestions: [{ spelling: 'Book', insertionText: 'Book', targetName: 'Book' },
        { spelling: 'Boolean', insertionText: 'Boolean', targetName: 'Boolean' }] });
    completions.closed(source.uri); completions.closed(source.uri);
    expect(completions.completion(source.uri, 10, tokenEnd)).toBeUndefined();
    expect(completions.completion(other.uri, 1, tokenEnd)?.suggestions[0]?.spelling).toBe('Book');
    completions.published(source, 0, report);
    expect(completions.completion(source.uri, 0, tokenEnd)?.suggestions[0]?.spelling).toBe('Book');
    completions.dispose(); completions.dispose(); completions.published(source, 0, report);
    expect(completions.completion(source.uri, 0, tokenEnd)).toBeUndefined();
    expect(completions.completion(other.uri, 1, tokenEnd)).toBeUndefined();
  });
});

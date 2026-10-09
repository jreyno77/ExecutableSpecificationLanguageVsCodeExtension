import { expect, it } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';

it('a supplied imported declaration permits checking the current open entry', () => {
  let report: DocumentReport | undefined;
  const analysis = new DocumentAnalysis({ publish: (_source, _version, actual) => { report = actual; }, clear: () => {} }, {
    read: uri => uri === 'file:///workspace/book.expec' ? { uri, text: 'type Book { title: Text }' } : undefined,
  });
  analysis.opened({ uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' }, 1);
  expect(report?.compilation?.value).toBeDefined();
});

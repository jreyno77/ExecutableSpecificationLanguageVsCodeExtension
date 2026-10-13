import { onTestFinished } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { SourceReferences } from '../../src/core/SourceReferences.js';
import { SourceReferenceAdapter } from '../../src/vscode/SourceReferenceAdapter.js';
import type { ReferencePresentation } from '../../src/vscode/ReferencePresentation.js';

/** Calls the real protocol adapter over the same captured document as core analysis. */
export class SourceReferenceConversion {
  private readonly references = new SourceReferences();
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => this.references.published(source, version, report),
    clear: uri => this.references.closed(uri),
  }, { localPath: () => undefined, read: () => undefined });
  private readonly document: TextDocument;
  private readonly adapter: SourceReferenceAdapter;
  private readonly replies: Array<ReferencePresentation | undefined> = [];
  constructor(text: string) {
    this.document = TextDocument.create('file:///workspace/reference-conversion.expec', 'expec', 1, text);
    onTestFinished(() => { this.analysis.closed(this.document.uri); this.references.dispose(); });
    this.analysis.opened({ uri: this.document.uri, text }, this.document.version);
    this.adapter = new SourceReferenceAdapter(this.references);
  }
  request(line: number, character: number, includeDeclaration: boolean): void {
    // Pass literal positions unchanged, including invalid UTF-16 boundaries.
    this.replies.push(this.adapter.references(this.document, { line, character }, includeDeclaration));
  }
  reply(request: number): ReferencePresentation | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual converted reference reply for ' + request);
    return this.replies[request - 1];
  }
  search(request: number): ReferencePresentation {
    const result = this.reply(request);
    if (!result) throw new Error('No converted reference search for request ' + request);
    return result;
  }
  location(request: number, location: number): Location {
    const locations = this.search(request).locations;
    if (!Number.isInteger(location) || location < 1 || location > locations.length)
      throw new Error('No actual converted location ' + location + ' for request ' + request);
    return locations[location - 1];
  }
  name(request: number, location: number): string {
    const actual = this.location(request, location);
    if (actual.uri !== this.document.uri) throw new Error('The converted reference points outside the captured caller source.');
    return this.document.getText(actual.range);
  }
}

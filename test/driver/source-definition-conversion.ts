import { onTestFinished } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { SourceNavigation } from '../../src/core/SourceNavigation.js';
import { SourceDefinitionAdapter } from '../../src/vscode/SourceDefinitionAdapter.js';

/** Adapter caller using the actual protocol document and one real core analysis. */
export class SourceDefinitionConversion {
  private readonly navigation = new SourceNavigation();
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => this.navigation.published(source, version, report),
    clear: uri => this.navigation.closed(uri),
  }, { read: () => undefined });
  private readonly document: TextDocument;
  private readonly adapter: SourceDefinitionAdapter;
  private readonly replies: Array<Location | undefined> = [];
  constructor(text: string) {
    this.document = TextDocument.create('file:///workspace/definition-conversion.expec', 'expec', 1, text);
    onTestFinished(() => { this.analysis.closed(this.document.uri); this.navigation.dispose(); });
    this.analysis.opened({ uri: this.document.uri, text }, this.document.version);
    this.adapter = new SourceDefinitionAdapter(this.navigation);
  }
  request(line: number, character: number): void {
    // Literal input passes unchanged, including invalid positions; the adapter owns validation.
    this.replies.push(this.adapter.definition(this.document, { line, character }));
  }
  reply(request: number): Location | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length) throw new Error('No actual converted definition reply for ' + request);
    return this.replies[request - 1];
  }
  location(request: number): Location {
    const result = this.reply(request);
    if (!result) throw new Error('No converted source definition for request ' + request);
    return result;
  }
  name(request: number): string {
    const actual = this.location(request);
    if (actual.uri !== this.document.uri) throw new Error('The converted definition points outside the captured caller source.');
    return this.document.getText(actual.range);
  }
}

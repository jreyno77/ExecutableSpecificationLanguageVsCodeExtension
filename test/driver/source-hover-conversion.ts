import { onTestFinished } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Hover, MarkupContent } from 'vscode-languageserver';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { SourceHover } from '../../src/core/SourceHover.js';
import { SourceHoverAdapter } from '../../src/vscode/SourceHoverAdapter.js';

/** Actual protocol caller: one core analysis and the replies returned by its adapter. */
export class SourceHoverConversion {
  private readonly hover = new SourceHover();
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => this.hover.published(source, version, report),
    clear: uri => this.hover.closed(uri),
  }, { read: () => undefined });
  private readonly document: TextDocument;
  private readonly adapter: SourceHoverAdapter;
  private readonly replies: Array<Hover | undefined> = [];
  constructor(text: string) {
    this.document = TextDocument.create('file:///workspace/hover-conversion.expec', 'expec', 1, text);
    onTestFinished(() => { this.analysis.closed(this.document.uri); this.hover.dispose(); });
    this.analysis.opened({ uri: this.document.uri, text }, this.document.version);
    this.adapter = new SourceHoverAdapter(this.hover);
  }
  request(line: number, character: number): void {
    this.replies.push(this.adapter.information(this.document, { line, character }));
  }
  reply(request: number): Hover | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length) throw new Error('No actual converted hover reply for ' + request);
    return this.replies[request - 1];
  }
  information(request: number): Hover {
    const actual = this.reply(request);
    if (!actual?.range) throw new Error('No actual converted hover range for ' + request);
    return actual;
  }
  markdown(request: number): string {
    const contents = this.information(request).contents as MarkupContent;
    if (contents.kind !== 'markdown' || typeof contents.value !== 'string') throw new Error('The converted hover did not return Markdown content.');
    return contents.value;
  }
  name(request: number): string { return this.document.getText(this.information(request).range); }
}

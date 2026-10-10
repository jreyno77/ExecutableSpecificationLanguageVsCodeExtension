import { onTestFinished } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { DocumentOutline } from '../../src/core/DocumentOutline.js';
import { SourceOutlineAdapter } from '../../src/vscode/SourceOutlineAdapter.js';
import { OutlineReplies, protocolOutline } from './outline-replies.js';

/** One real analysis and native adapter, including the actual earlier TextDocument snapshots. */
export class SourceOutlineConversion {
  readonly replies = new OutlineReplies();
  private readonly outline = new DocumentOutline();
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => this.outline.published(source, version, report),
    clear: uri => this.outline.closed(uri),
  }, { read: () => undefined });
  private readonly documents = new Map<number, TextDocument>();
  private readonly adapter: SourceOutlineAdapter;
  constructor(private readonly uri: string, text: string, version: number) {
    const document = TextDocument.create(uri, 'expec', version, text);
    this.documents.set(version, document);
    onTestFinished(() => { this.analysis.closed(uri); this.outline.dispose(); });
    this.analysis.opened({ uri, text }, version);
    this.adapter = new SourceOutlineAdapter(this.outline);
  }
  change(text: string, version: number): void {
    if (this.documents.has(version)) throw new Error('The outline conversion snapshot version is already recorded.');
    this.documents.set(version, TextDocument.create(this.uri, 'expec', version, text));
    this.analysis.changed({ uri: this.uri, text }, version);
  }
  request(version: number): void {
    const document = this.documents.get(version);
    if (!document) throw new Error('No actual outline TextDocument snapshot for version ' + version);
    this.replies.record(protocolOutline(this.adapter.symbols(document)));
  }
}

import { onTestFinished } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, TextEdit } from 'vscode-languageserver';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { SourceCompletion } from '../../src/core/SourceCompletion.js';
import { SourceCompletionAdapter } from '../../src/vscode/SourceCompletionAdapter.js';

/** One real analysis publication and its actual native protocol conversion. */
export class SourceCompletionConversion {
  private readonly completion = new SourceCompletion();
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => this.completion.published(source, version, report),
    clear: uri => this.completion.closed(uri),
  }, { read: () => undefined });
  private readonly document: TextDocument;
  private readonly adapter: SourceCompletionAdapter;
  private readonly replies: Array<readonly CompletionItem[]> = [];
  constructor(text: string) {
    this.document = TextDocument.create('file:///workspace/completion-conversion.expec', 'expec', 1, text);
    onTestFinished(() => { this.analysis.closed(this.document.uri); this.completion.dispose(); });
    this.analysis.opened({ uri: this.document.uri, text }, this.document.version);
    this.adapter = new SourceCompletionAdapter(this.completion);
  }
  request(line: number, character: number): void { this.replies.push(this.adapter.items(this.document, { line, character })); }
  reply(request: number): readonly CompletionItem[] {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual converted completion reply for ' + request);
    return this.replies[request - 1]!;
  }
  item(request: number, index: number): CompletionItem {
    if (!Number.isInteger(index) || index < 1) throw new RangeError('Converted suggestion indexes are positive integers.');
    const item = this.reply(request)[index - 1];
    if (!item) throw new Error('The actual converted completion has no suggestion ' + index);
    return item;
  }
  edit(request: number, index: number): TextEdit {
    const edit = this.item(request, index).textEdit;
    if (!edit || !('range' in edit)) throw new Error('The actual completion did not return an ordinary TextEdit.');
    return edit;
  }
}

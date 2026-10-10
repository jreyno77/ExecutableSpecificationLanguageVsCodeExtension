import { InstalledExpecEditor } from './installed-extension.js';
import type { NativeDefinitionCase } from './native-definition.js';
import type { NativeCompletionObservation } from './vscode-session.js';

/** Each request retains this installed provider's actual contribution, including empty replies. */
export class NativeCompletionRecording {
  private readonly replies: NativeCompletionObservation[] = [];
  private text?: string;
  private constructor(private readonly source: NativeDefinitionCase) {}
  static async open(text: string): Promise<NativeCompletionRecording> {
    const editor = await InstalledExpecEditor.prepare();
    return new NativeCompletionRecording(await editor.definitionEditor({ 'entry.expec': text }));
  }
  edit(text: string): Promise<void> { return this.source.editEntry(text); }
  async request(line: number, column: number): Promise<void> {
    const actual = await this.source.completions(line, column);
    this.text = actual.entryText;
    this.replies.push(actual);
  }
  async apply(request: number, index: number): Promise<void> {
    this.item(request, index);
    this.text = await this.source.applyCompletion(request, index);
  }
  reply(request: number): NativeCompletionObservation {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual native completion reply for ' + request);
    return this.replies[request - 1]!;
  }
  item(request: number, index: number): NativeCompletionObservation['items'][number] {
    if (!Number.isInteger(index) || index < 1) throw new RangeError('Native suggestion indexes are positive integers.');
    const item = this.reply(request).items[index - 1];
    if (!item) throw new Error('The actual native completion has no suggestion ' + index);
    return item;
  }
  currentText(): string {
    if (this.text === undefined) throw new Error('No actual native completion text was recorded.');
    return this.text;
  }
  savedText(): Promise<string> { return this.source.savedEntryText(); }
  dirty(): boolean { return this.source.observation().entryDirty; }
  filesUnchanged(): Promise<boolean> { return this.source.filesUnchanged(); }
}

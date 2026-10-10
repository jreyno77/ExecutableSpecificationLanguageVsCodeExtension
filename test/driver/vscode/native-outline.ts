import { InstalledExpecEditor } from './installed-extension.js';
import type { NativeDefinitionCase } from './native-definition.js';
import { OutlineReplies } from '../outline-replies.js';

/** Reuses the suite-owned installed host and its isolated source-document case. */
export class NativeOutlineRecording {
  readonly replies = new OutlineReplies();
  private text: string | undefined;
  private constructor(private readonly source: NativeDefinitionCase) {}
  static async open(fileName: string, text: string): Promise<NativeOutlineRecording> {
    const editor = await InstalledExpecEditor.prepare();
    return new NativeOutlineRecording(await editor.definitionEditor({ 'entry.expec': text }, fileName));
  }
  edit(text: string): Promise<void> { return this.source.editEntry(text); }
  async request(): Promise<void> {
    const actual = await this.source.symbols();
    this.text = actual.entryText;
    this.replies.record(actual.symbols);
  }
  currentText(): string { if (this.text === undefined) throw new Error('No actual native outline text was recorded.'); return this.text; }
  savedText(): Promise<string> { return this.source.savedEntryText(); }
  dirty(): boolean { return this.source.observation().entryDirty; }
  filesUnchanged(): Promise<boolean> { return this.source.filesUnchanged(); }
}

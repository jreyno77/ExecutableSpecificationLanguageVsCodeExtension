import { InstalledExpecEditor } from './vscode/installed-extension.js';
import { ExpecSyntax } from './vscode/syntax-reader.js';
import type { TextDocument } from 'vscode';
import { WorkspaceCore } from '../../src/core/WorkspaceCore.js';
import { EditorAdapter } from '../../src/vscode/EditorAdapter.js';
import { RecordingCore } from './recording-core.js';
import { OutputTabsBrowser } from './output-tabs-browser.js';
import { OutputTab } from "../../src/core/OutputTab.js";
import { SourceDocument } from "../../src/core/SourceDocument.js";
export class WorkspaceDriver {
  private syntax!: ExpecSyntax;
  private installedEditor!: InstalledExpecEditor;
  private syntaxLanguage = "";
  private core!: WorkspaceCore;
  private editor!: EditorAdapter;
  private readonly documents = new Map<string, { content: { text: string }; document: TextDocument }>();
  private recording!: RecordingCore;
  private ui!: OutputTabsBrowser;
  private previewRequests: SourceDocument[] = [];
  private generationRequests: SourceDocument[] = [];
  private tabs: OutputTab[] = [];
  private editorTabs: OutputTab[] = [];
  async connectedOutputs(previews: Array<OutputTab>, generateOnSave: boolean): Promise<void> {
    this.core = new WorkspaceCore({
      preview: source => { this.previewRequests.push(source); return previews; },
      generate: source => { this.generationRequests.push(source); },
    }, generateOnSave);
  }
  async openOutputTabs(): Promise<void> {
    this.ui = await OutputTabsBrowser.open();
  }
  async editorCoreReturns(tabs: Array<OutputTab>): Promise<void> {
    this.recording = new RecordingCore(tabs);
    this.editor = new EditorAdapter(this.recording);
  }
  async requestPreview(source: SourceDocument): Promise<void> {
    this.tabs = this.core.preview(source);
  }
  async saveSource(source: SourceDocument): Promise<void> {
    this.core.sourceSaved(source);
  }
  async presentOutputs(tabs: Array<OutputTab>): Promise<void> {
    await this.ui.present(tabs);
  }
  async selectOutput(id: string): Promise<void> {
    await this.ui.select(id);
  }
  async changeEditorDocument(source: SourceDocument): Promise<void> {
    this.editorTabs = this.editor.documentChanged(this.editorDocument(source));
  }
  async saveEditorDocument(source: SourceDocument): Promise<void> {
    this.editor.documentSaved(this.editorDocument(source));
  }
  private editorDocument(source: SourceDocument): TextDocument {
    let stored = this.documents.get(source.uri);
    if (!stored) {
      const content = { text: source.text };
      stored = { content, document: { uri: { toString: () => source.uri }, getText: () => content.text } as TextDocument };
      this.documents.set(source.uri, stored);
    }
    stored.content.text = source.text;
    return stored.document;
  }
  async returnedTabs(): Promise<Array<OutputTab>> {
    return this.tabs;
  }
  async outputPreviewRequests(): Promise<Array<SourceDocument>> {
    return this.previewRequests;
  }
  async outputGenerationRequests(): Promise<Array<SourceDocument>> {
    return this.generationRequests;
  }
  async outputLabels(): Promise<Array<string>> {
    return this.ui.labels();
  }
  async selectedOutputContent(): Promise<string> {
    return this.ui.content();
  }
  async corePreviewRequests(): Promise<Array<SourceDocument>> {
    return this.recording.previews;
  }
  async coreSaveRequests(): Promise<Array<SourceDocument>> {
    return this.recording.saves;
  }
  async editorPreviewTabs(): Promise<Array<OutputTab>> {
    return this.editorTabs;
  }

async disposeOutputTabs(): Promise<void> {
    await this.ui.dispose();
  }

async outputHostExists(): Promise<boolean> {
    return this.ui.hostExists();
  }

async preparedExpecEditor(): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
  }

async preparedExpecGrammar(): Promise<void> {
    this.syntax = await ExpecSyntax.prepare();
  }

async openSyntaxFile(fileName: string, text: string): Promise<void> {
    this.syntaxLanguage = await this.installedEditor.open(fileName, text);
  }

async tokenizeSyntax(text: string): Promise<void> {
    this.syntax.tokenize(text);
  }

async editorLanguageId(): Promise<string> {
    return this.syntaxLanguage;
  }

async syntaxScopeAt(line: number, column: number): Promise<string> {
    return this.syntax.scopeAt(line, column);
  }
}

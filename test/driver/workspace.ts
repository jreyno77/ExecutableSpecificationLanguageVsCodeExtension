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

async syntaxAnalysis(): Promise<void> {
    throw new Error("Not implemented: workspace.syntaxAnalysis");
  }

async diagnosticEditor(fileName: string, initialText: string): Promise<void> {
    throw new Error("Not implemented: workspace.diagnosticEditor");
  }

async openSource(source: SourceDocument, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.openSource");
  }

async changeSource(source: SourceDocument, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.changeSource");
  }

async closeSource(uri: string): Promise<void> {
    throw new Error("Not implemented: workspace.closeSource");
  }

async tryOpeningSource(source: SourceDocument, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.tryOpeningSource");
  }

async tryChangingSource(source: SourceDocument, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.tryChangingSource");
  }

async editWithoutSaving(text: string): Promise<void> {
    throw new Error("Not implemented: workspace.editWithoutSaving");
  }

async editQuickly(first: string, latest: string): Promise<void> {
    throw new Error("Not implemented: workspace.editQuickly");
  }

async closeEditedDocument(): Promise<void> {
    throw new Error("Not implemented: workspace.closeEditedDocument");
  }

async publishedVersion(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.publishedVersion");
  }

async publicationCount(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.publicationCount");
  }

async syntaxProblemCount(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.syntaxProblemCount");
  }

async syntaxExplanation(uri: string): Promise<string> {
    throw new Error("Not implemented: workspace.syntaxExplanation");
  }

async syntaxStartLine(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.syntaxStartLine");
  }

async syntaxStartColumn(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.syntaxStartColumn");
  }

async syntaxEndLine(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.syntaxEndLine");
  }

async syntaxEndColumn(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.syntaxEndColumn");
  }

async clearCount(uri: string): Promise<number> {
    throw new Error("Not implemented: workspace.clearCount");
  }

async invalidVersionRejected(): Promise<boolean> {
    throw new Error("Not implemented: workspace.invalidVersionRejected");
  }

async previouslyVisibleProblemCount(): Promise<number> {
    throw new Error("Not implemented: workspace.previouslyVisibleProblemCount");
  }

async editorProblemCount(): Promise<number> {
    throw new Error("Not implemented: workspace.editorProblemCount");
  }

async editorProblemMessage(): Promise<string> {
    throw new Error("Not implemented: workspace.editorProblemMessage");
  }

async editorProblemIsError(): Promise<boolean> {
    throw new Error("Not implemented: workspace.editorProblemIsError");
  }

async editorProblemStartLine(): Promise<number> {
    throw new Error("Not implemented: workspace.editorProblemStartLine");
  }

async editorProblemStartColumn(): Promise<number> {
    throw new Error("Not implemented: workspace.editorProblemStartColumn");
  }

async editorProblemEndLine(): Promise<number> {
    throw new Error("Not implemented: workspace.editorProblemEndLine");
  }

async editorProblemEndColumn(): Promise<number> {
    throw new Error("Not implemented: workspace.editorProblemEndColumn");
  }

async savedDocumentText(): Promise<string> {
    throw new Error("Not implemented: workspace.savedDocumentText");
  }

async openDocumentText(): Promise<string> {
    throw new Error("Not implemented: workspace.openDocumentText");
  }

async openDocumentIsDirty(): Promise<boolean> {
    throw new Error("Not implemented: workspace.openDocumentIsDirty");
  }
}

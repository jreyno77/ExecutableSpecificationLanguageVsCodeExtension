import type { DiagnosticDocument } from './vscode/diagnostic-document.js';
import type { DiagnosticObservation } from './vscode/vscode-session.js';
import { DocumentAnalysisRecording } from './document-analysis.js';
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
  private diagnosticDocument!: DiagnosticDocument;
  private diagnosticObservation!: DiagnosticObservation;
  private analysisRecording!: DocumentAnalysisRecording;
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
    this.analysisRecording = new DocumentAnalysisRecording();
  }

async diagnosticEditor(fileName: string, initialText: string): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.diagnosticDocument = await this.installedEditor.diagnosticDocument(fileName, initialText);
    this.diagnosticObservation = await this.diagnosticDocument.observation();
  }

async openSource(source: SourceDocument, version: number): Promise<void> {
    this.analysisRecording.opened(source, version);
  }

async changeSource(source: SourceDocument, version: number): Promise<void> {
    this.analysisRecording.changed(source, version);
  }

async closeSource(uri: string): Promise<void> {
    this.analysisRecording.closed(uri);
  }

async tryOpeningSource(source: SourceDocument, version: number): Promise<void> {
    this.analysisRecording.tryOpened(source, version);
  }

async tryChangingSource(source: SourceDocument, version: number): Promise<void> {
    this.analysisRecording.tryChanged(source, version);
  }

async editWithoutSaving(text: string): Promise<void> {
    this.diagnosticObservation = await this.diagnosticDocument.edit(text);
  }

async editQuickly(first: string, latest: string): Promise<void> {
    this.diagnosticObservation = await this.diagnosticDocument.editQuickly(first, latest);
  }

async closeEditedDocument(): Promise<void> {
    this.diagnosticObservation = await this.diagnosticDocument.close();
  }

async publishedVersion(uri: string): Promise<number> {
    return this.analysisRecording.latest(uri).version;
  }

async publicationCount(uri: string): Promise<number> {
    return this.analysisRecording.publicationCount(uri);
  }

async syntaxProblemCount(uri: string): Promise<number> {
    return this.analysisRecording.latest(uri).problems.length;
  }

async syntaxExplanation(uri: string): Promise<string> {
    return this.analysisRecording.problem(uri).explanation;
  }

async syntaxStartLine(uri: string): Promise<number> {
    return this.analysisRecording.problem(uri).primaryRange.start.line;
  }

async syntaxStartColumn(uri: string): Promise<number> {
    return this.analysisRecording.problem(uri).primaryRange.start.column;
  }

async syntaxEndLine(uri: string): Promise<number> {
    return this.analysisRecording.problem(uri).primaryRange.end.line;
  }

async syntaxEndColumn(uri: string): Promise<number> {
    return this.analysisRecording.problem(uri).primaryRange.end.column;
  }

async clearCount(uri: string): Promise<number> {
    return this.analysisRecording.clearCount(uri);
  }

async invalidVersionRejected(): Promise<boolean> {
    return this.analysisRecording.invalidVersionRejected();
  }

async previouslyVisibleProblemCount(): Promise<number> {
    return this.diagnosticObservation.previousProblemCount;
  }

async editorProblemCount(): Promise<number> {
    return this.diagnosticObservation.diagnostics.length;
  }

async editorProblemMessage(): Promise<string> {
    return this.nativeProblem().message;
  }

async editorProblemIsError(): Promise<boolean> {
    return this.nativeProblem().severity === 0;
  }

async editorProblemStartLine(): Promise<number> {
    return this.nativeProblem().range.start.line + 1;
  }

async editorProblemStartColumn(): Promise<number> {
    return this.nativeProblem().range.start.character + 1;
  }

async editorProblemEndLine(): Promise<number> {
    return this.nativeProblem().range.end.line + 1;
  }

async editorProblemEndColumn(): Promise<number> {
    return this.nativeProblem().range.end.character + 1;
  }

async savedDocumentText(): Promise<string> {
    const saved = this.diagnosticObservation.savedText;
    if (saved === null) throw new Error('An untitled document has no saved file.');
    return saved;
  }

async openDocumentText(): Promise<string> {
    return this.diagnosticObservation.text;
  }

async openDocumentIsDirty(): Promise<boolean> {
    return this.diagnosticObservation.dirty;
  }
  private nativeProblem(): DiagnosticObservation['diagnostics'][number] {
    const problem = this.diagnosticObservation.diagnostics[0];
    if (!problem) throw new Error('The native editor has no syntax problem.');
    return problem;
  }}

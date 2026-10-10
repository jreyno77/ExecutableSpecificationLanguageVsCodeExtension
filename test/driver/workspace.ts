import { SourceDefinitionConversion } from './source-definition-conversion.js';
import { SourceHoverConversion } from './source-hover-conversion.js';
import type { NativeDefinitionCase } from './vscode/native-definition.js';
import { SourceNavigationRecording } from './source-navigation.js';
import { SourceHoverRecording } from './source-hover.js';
import { GenerationOnSaveRecording } from './generation-on-save.js';
import type { NativeGenerationCase } from './vscode/native-generation.js';
import type { ConnectionSidebarCase } from './vscode/connection-sidebar.js';
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import { ConnectionRecording } from './connection-recording.js';
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
import { OutputPreviewsRecording } from './output-previews.js';
import type { NativePreviewCase } from './vscode/native-preview.js';
export class WorkspaceDriver {
  private nativeHover!: NativeDefinitionCase;
  private hoverConversionRecording!: SourceHoverConversion;
  private definitionConversionRecording!: SourceDefinitionConversion;
    private nativeDefinition!: NativeDefinitionCase;
  private navigationRecording!: SourceNavigationRecording;
  private sourceHoverRecording!: SourceHoverRecording;
  private sidebarCase!: ConnectionSidebarCase;
  private connectionRecording!: ConnectionRecording;
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
  }
async semanticAnalysis(): Promise<void> {
    this.analysisRecording = new DocumentAnalysisRecording();
  }

async importedEditor(entryText: string, dependencyText: string): Promise<void> {
    await this.openImportedEditor(entryText, dependencyText);
  }

async missingImportedEditor(entryText: string): Promise<void> {
    await this.openImportedEditor(entryText, null);
  }

async saveSemanticSource(source: SourceDocument): Promise<void> {
    this.analysisRecording.saved(source);
  }

async removeSemanticSource(uri: string): Promise<void> {
    this.analysisRecording.removed(uri);
  }

async openSemanticSource(source: SourceDocument, version: number): Promise<void> {
    this.analysisRecording.opened(source, version);
  }

async changeSemanticSource(source: SourceDocument, version: number): Promise<void> {
    this.analysisRecording.changed(source, version);
  }

async closeSemanticSource(uri: string): Promise<void> {
    this.analysisRecording.closed(uri);
  }

async saveImportedText(text: string): Promise<void> {
    this.diagnosticObservation = await this.diagnosticDocument.changeDependency(text);
  }

async deleteImportedFile(): Promise<void> {
    this.diagnosticObservation = await this.diagnosticDocument.changeDependency(null);
  }

async semanticProblemCode(uri: string): Promise<string> {
    return this.analysisRecording.semanticProblem(uri).code;
  }

async semanticProblemCount(uri: string): Promise<number> {
    return this.checkedCompilation(uri).problems.length;
  }

async semanticStartLine(uri: string): Promise<number> {
    return this.semanticRange(uri).start.line;
  }

async semanticStartColumn(uri: string): Promise<number> {
    return this.semanticRange(uri).start.column;
  }

async semanticEndColumn(uri: string): Promise<number> {
    return this.semanticRange(uri).end.column;
  }

async hasCheckedSpecification(uri: string): Promise<boolean> {
    return this.analysisRecording.compilation(uri)?.value !== undefined;
  }

async semanticDeferredCount(uri: string): Promise<number> {
    return this.checkedCompilation(uri).deferred.length;
  }

async semanticPublicationCount(uri: string): Promise<number> {
    return this.analysisRecording.publicationCount(uri);
  }

async semanticPublishedVersion(uri: string): Promise<number> {
    return this.analysisRecording.latest(uri).version;
  }

async editorProblemCode(): Promise<string> {
    const code = this.nativeProblem().code;
    if (typeof code !== "string") throw new Error("The native diagnostic has no textual problem code.");
    return code;
  }

async entryVersionUnchanged(): Promise<boolean> {
    return this.diagnosticObservation.version === this.diagnosticObservation.initialVersion;
  }

  private async openImportedEditor(entryText: string, dependencyText: string | null): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.diagnosticDocument = await this.installedEditor.diagnosticDocument('basket.expec', entryText, dependencyText);
    this.diagnosticObservation = await this.diagnosticDocument.observation();
  }
  private checkedCompilation(uri: string) {
    const compilation = this.analysisRecording.compilation(uri);
    if (!compilation) throw new Error('No compiler report was published for ' + uri);
    return compilation;
  }
  private semanticRange(uri: string) {
    const origin = this.analysisRecording.semanticProblem(uri).at;
    if (origin.kind !== 'source') throw new Error('The semantic problem has no source range.');
    return origin.range;
  }

async connectionWorkspace(configuration: string, writable: boolean): Promise<void> {
    this.connectionRecording = await ConnectionRecording.open(configuration, writable);
  }

async missingConnectionWorkspace(writable: boolean): Promise<void> {
    this.connectionRecording = await ConnectionRecording.open(undefined, writable);
  }

async connectionSidebar(configuration: string, directories: Array<string>): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.sidebarCase = await this.installedEditor.connectionSidebar(configuration, directories);
  }

async unconfiguredSidebar(directories: Array<string>): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.sidebarCase = await this.installedEditor.connectionSidebar(undefined, directories);
  }

async inspectConnection(): Promise<void> {
    await this.connectionRecording.inspect();
  }

async chooseProjectDirectory(name: string): Promise<void> {
    await this.connectionRecording.choose(name);
  }

async confirmRequestedConfigurationSave(): Promise<void> {
    await this.connectionRecording.confirmSave();
  }

async rejectRequestedConfigurationSave(message: string): Promise<void> {
    await this.connectionRecording.rejectSave(message);
  }

async makeProjectUnavailable(name: string): Promise<void> {
    await this.connectionRecording.remove(name);
  }

async restoreProjectDirectory(name: string): Promise<void> {
    await this.connectionRecording.restore(name);
  }

async replaceConnectionConfiguration(text: string): Promise<void> {
    await this.connectionRecording.replace(text);
  }

async observeSidebar(): Promise<void> {
    await this.sidebarCase.observe();
  }

async chooseProjectInSidebar(directory: string): Promise<void> {
    await this.sidebarCase.choose(directory);
  }

async saveSidebarConfiguration(text: string): Promise<void> {
    await this.sidebarCase.save(text);
  }

async removeSidebarProject(directory: string): Promise<void> {
    await this.sidebarCase.remove(directory);
  }

async restoreSidebarProject(directory: string): Promise<void> {
    await this.sidebarCase.restore(directory);
  }

async editConfigurationWithoutSaving(text: string): Promise<void> {
    await this.sidebarCase.edit(text);
  }

async connectionStatus(): Promise<string> {
    return this.connectionRecording.latest.status;
  }

async configuredProjectName(): Promise<string> {
    return basename(this.connectionRecording.latest.target ?? "");
  }

async verifiedProjectName(): Promise<string> {
    return basename(this.connectionRecording.latest.verifiedDirectory ?? "");
  }

async connectionMessage(): Promise<string> {
    return this.connectionRecording.latest.message;
  }

async requestedConfigurationSaves(): Promise<number> {
    return this.connectionRecording.saves.length;
  }

async actualConfigurationExists(): Promise<boolean> {
    try { await stat(this.connectionRecording.file); return true; } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false; throw error; }
  }

async requestedProjectName(): Promise<string> {
    const request = this.connectionRecording.saves.at(-1); if (!request) throw new Error("No configuration save was requested."); return basename(JSON.parse(request.text).project.root);
  }

async requestedSettings(): Promise<string> {
    const request = this.connectionRecording.saves.at(-1); if (!request) throw new Error("No configuration save was requested."); const { project, ...settings } = JSON.parse(request.text); return JSON.stringify(settings);
  }

async connectedPublications(): Promise<number> {
    return this.connectionRecording.states.filter(state => state.status === "connected").length;
  }

async unavailablePublications(): Promise<number> {
    return this.connectionRecording.states.filter(state => state.status === "unavailable").length;
  }

async connectionPublications(): Promise<number> {
    return this.connectionRecording.states.length;
  }

async sidebarConnectionStatus(): Promise<string> {
    return this.sidebarCase.last.status;
  }

async sidebarProjectName(): Promise<string> {
    return this.sidebarCase.last.project;
  }

async sidebarConnectionExplanation(): Promise<string> {
    return this.sidebarCase.last.explanation;
  }

async sidebarSavedProjectName(): Promise<string> {
    const saved = this.sidebarCase.last.saved;
    if (saved === undefined) throw new Error('The native sidebar has no saved configuration.');
    return basename(JSON.parse(saved).project.root);
  }

async sidebarSavedConfiguration(): Promise<string> {
    const saved = this.sidebarCase.last.saved;
    if (saved === undefined) throw new Error('The native sidebar has no saved configuration.');
    return saved;
  }

async sidebarUnsavedConfiguration(): Promise<string> {
    const unsaved = this.sidebarCase.last.unsaved;
    if (unsaved === undefined) throw new Error('The native sidebar has no unsaved configuration.');
    return unsaved;
  }

async previewAuthoring(configuration: string): Promise<void> {
    this.previewRecording = await OutputPreviewsRecording.create(configuration);
  }

async gatedPreviewAuthoring(configuration: string, id: string): Promise<void> {
    this.previewRecording = await OutputPreviewsRecording.create(configuration, id);
  }

async undecodableTextOutput(): Promise<void> {
    this.previewRecording = await OutputPreviewsRecording.create('{"formatVersion":1,"version":"0.1.0","build":{"entries":["src/library.expec"]},"outputs":[{"id":"typescript","options":{}}]}', undefined, 'text');
  }

async unsupportedBinaryOutput(): Promise<void> {
    this.previewRecording = await OutputPreviewsRecording.create('{"formatVersion":1,"version":"0.1.0","build":{"entries":["src/library.expec"]},"outputs":[{"id":"binary","options":{}}]}', undefined, 'binary');
  }

async previewEditor(initialText: string, configuration: string): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.nativePreview = await this.installedEditor.previewEditor(initialText, configuration);
  }

async openPreviewSource(source: SourceDocument, version: number): Promise<void> {
    this.previewRecording.opened(source, version);
  }

async changePreviewSource(source: SourceDocument, version: number): Promise<void> {
    this.previewRecording.edited(source, version);
  }

async changePreviewConfiguration(configuration: string): Promise<void> {
    this.previewRecording.configure(configuration);
  }

async settleCurrentPreviews(): Promise<void> {
    await this.previewRecording.settle();
  }

async awaitReadyOutput(id: string): Promise<void> {
    await this.previewRecording.ready(id);
  }

async rememberPreviewOutput(id: string): Promise<void> {
    this.previewRecording.remember(id);
  }

async armNextOutput(id: string): Promise<void> {
    this.previewRecording.arm(id);
  }

async savePreviewImport(uri: string, text: string): Promise<void> {
    this.previewRecording.savedImport(uri, text);
  }

async closePreviewSource(uri: string): Promise<void> {
    this.previewRecording.closed(uri);
  }

async disposePreviews(): Promise<void> {
    this.previewRecording.disposed();
  }

async awaitHeldOutput(id: string): Promise<void> {
    await this.previewRecording.awaitHeld(id);
  }

async releaseHeldOutput(id: string): Promise<void> {
    this.previewRecording.release(id);
  }

async drainPreviewWork(): Promise<void> {
    await this.previewRecording.drain();
  }

async selectOutputDocument(path: string): Promise<void> {
    await this.ui.selectDocument(path);
  }

async setDiagramZoom(percent: number): Promise<void> {
    await this.ui.setZoom(percent);
  }

async resetDiagramZoom(): Promise<void> {
    await this.ui.resetZoom();
  }

async scrollDiagram(horizontal: number, vertical: number): Promise<void> {
    await this.ui.scrollDiagram(horizontal, vertical);
  }

async showOutputPreviews(): Promise<void> {
    await this.nativePreview.show();
  }

async editPreviewWithoutSaving(text: string): Promise<void> {
    await this.nativePreview.edit(text);
  }

async savePreviewConfiguration(text: string): Promise<void> {
    await this.nativePreview.saveConfiguration(text);
  }

async selectPreviewOutput(id: string): Promise<void> {
    await this.nativePreview.selectOutput(id);
  }

async selectPreviewDocument(path: string): Promise<void> {
    await this.nativePreview.selectDocument(path);
  }

async closePreviewPanel(): Promise<void> {
    await this.nativePreview.closePanel();
  }

async zoomPreviewDiagram(): Promise<void> {
    await this.nativePreview.zoomDiagram();
  }

async scrollPreviewDiagram(): Promise<void> {
    await this.nativePreview.scrollDiagram();
  }

async resetPreviewZoom(): Promise<void> {
    await this.nativePreview.resetZoom();
  }

async previewOutputIds(): Promise<Array<string>> {
    return this.previewRecording.current.tabs.map(tab => tab.id);
  }

async previewOutputLabels(): Promise<Array<string>> {
    return this.previewRecording.current.tabs.map(tab => tab.label);
  }

async previewOutputStatus(id: string): Promise<string> {
    return this.previewRecording.tab(id).status!;
  }

async rememberedPreviewOutputStatus(id: string): Promise<string> {
    return this.previewRecording.earlier(id).status!;
  }

async rememberedPreviewDocumentMediaType(id: string, path: string): Promise<string> {
    return this.previewRecording.document(id, path, true).mediaType;
  }

async rememberedPreviewDocumentContains(id: string, path: string, content: string): Promise<boolean> {
    return this.previewRecording.document(id, path, true).content.includes(content);
  }

async previewDocumentPaths(id: string): Promise<Array<string>> {
    return this.previewRecording.tab(id).documents!.map(document => document.path);
  }

async previewDocumentMediaType(id: string, path: string): Promise<string> {
    return this.previewRecording.document(id, path).mediaType;
  }

async previewDocumentContains(id: string, path: string, content: string): Promise<boolean> {
    return this.previewRecording.document(id, path).content.includes(content);
  }

async previewSvgHasLabel(id: string, path: string, label: string): Promise<boolean> {
    return this.previewRecording.svgHasLabel(id, path, label);
  }

async previewExplanationContains(id: string, text: string): Promise<boolean> {
    return this.previewRecording.tab(id).message?.includes(text) ?? false;
  }

async previewViewExplanation(): Promise<string> {
    return this.previewRecording.current.message ?? '';
  }

async previewSourceUri(): Promise<string> {
    return this.previewRecording.current.uri!;
  }

async previewSourceVersion(): Promise<number> {
    return this.previewRecording.current.version!;
  }

async previewTargetPathsAndBytesUnchanged(): Promise<boolean> {
    return this.previewRecording.preserved();
  }

async outputInvocationCount(id: string): Promise<number> {
    return this.previewRecording.count(id);
  }

async outputMaximumConcurrentInvocations(id: string): Promise<number> {
    return this.previewRecording.maximum(id);
  }

async postDisposalPublicationCount(): Promise<number> {
    return this.previewRecording.afterDisposal();
  }

async selectedOutputId(): Promise<string> {
    return this.ui.selectedId();
  }

async selectedOutputStatus(): Promise<string> {
    return this.ui.status();
  }

async selectedOutputExplanation(): Promise<string> {
    return this.ui.explanation();
  }

async selectedDocumentPaths(): Promise<Array<string>> {
    return this.ui.documentPaths();
  }

async selectedDocumentPath(): Promise<string> {
    return this.ui.documentPath();
  }

async diagramImageLoaded(): Promise<boolean> {
    return this.ui.imageLoaded();
  }

async diagramZoomPercent(): Promise<number> {
    return this.ui.zoom();
  }

async diagramDisplayedWidth(): Promise<number> {
    return this.ui.displayedWidth();
  }

async diagramScrollLeft(): Promise<number> {
    return this.ui.scrollLeft();
  }

async diagramScrollTop(): Promise<number> {
    return this.ui.scrollTop();
  }

async nativePreviewOutputIds(): Promise<Array<string>> {
    return this.nativePreview.outputIds();
  }

async nativePreviewSelectedId(id: string, path: string): Promise<string> {
    return this.nativePreview.selectedId(id, path);
  }

async nativePreviewDocumentPath(id: string, path: string): Promise<string> {
    return this.nativePreview.documentPath(id, path);
  }

async nativePreviewDocumentMediaType(id: string, path: string): Promise<string> {
    return this.nativePreview.documentMediaType(id, path);
  }

async nativePreviewTextIncludes(id: string, path: string, text: string): Promise<boolean> {
    return this.nativePreview.textIncludes(id, path, text);
  }

async nativePreviewObservedStatus(id: string, path: string): Promise<string> {
    return this.nativePreview.observedStatus(id, path);
  }

async nativePreviewBeforeEditStatus(): Promise<string> {
    return this.nativePreview.beforeEditStatus();
  }

async nativePreviewBeforeConfigurationIds(): Promise<Array<string>> {
    return this.nativePreview.beforeConfigurationIds();
  }

async nativePreviewClosedTextIncludes(text: string): Promise<boolean> {
    return this.nativePreview.closedTextIncludes(text);
  }

async nativePreviewZoomHistory(): Promise<Array<number>> {
    return this.nativePreview.zoomHistory();
  }

async nativePreviewDocumentCount(): Promise<number> {
    return this.nativePreview.documentCount();
  }

async nativePreviewStatus(): Promise<string> {
    return this.nativePreview.status();
  }

async nativePreviewExplanation(): Promise<string> {
    return this.nativePreview.explanation();
  }

async nativePreviewImageDecoded(id: string, path: string): Promise<boolean> {
    return this.nativePreview.imageDecoded(id, path);
  }

async nativePreviewSvgContainsLabel(id: string, path: string, text: string): Promise<boolean> {
    return this.nativePreview.svgContainsLabel(id, path, text);
  }

async nativePreviewZoomPercent(): Promise<number> {
    return this.nativePreview.zoomPercent();
  }

async nativePreviewDiagramOverflow(): Promise<boolean> {
    return this.nativePreview.diagramOverflow();
  }

async nativePreviewDiagramScrolled(): Promise<boolean> {
    return this.nativePreview.diagramScrolled();
  }

async nativePreviewSavedText(): Promise<string> {
    return this.nativePreview.savedText();
  }

async nativePreviewOpenText(): Promise<string> {
    return this.nativePreview.openText();
  }

async nativePreviewSourceDirty(): Promise<boolean> {
    return this.nativePreview.sourceDirty();
  }

async nativePreviewFilesUnchanged(): Promise<boolean> {
    return this.nativePreview.filesUnchanged();
  }

    private previewRecording!: OutputPreviewsRecording;
    private nativePreview!: NativePreviewCase;
    private savedGeneration!: GenerationOnSaveRecording;
    private nativeGeneration!: NativeGenerationCase;

async savedGenerationWorkspace(source: string, otherEntry: string, enabled: boolean): Promise<void> {
    this.savedGeneration = await GenerationOnSaveRecording.create(source, otherEntry, enabled);
  }

async heldGenerationWorkspace(source: string, otherEntry: string): Promise<void> {
    this.savedGeneration = await GenerationOnSaveRecording.create(source, otherEntry, true, true);
  }

async generationEditor(source: string, otherEntry: string, enabled: boolean): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.nativeGeneration = await this.installedEditor.generationEditor(source, otherEntry, enabled);
  }

async generationEditorWithOutputs(source: string, otherEntry: string, enabled: boolean): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.nativeGeneration = await this.installedEditor.generationEditor(source, otherEntry, enabled, true);
  }

async generationEditorWithoutRuntime(source: string): Promise<void> {
    this.installedEditor = await InstalledExpecEditor.prepare();
    this.nativeGeneration = await this.installedEditor.generationEditor(source, "type Shelf { copies: Number }", true, false, true);
  }

async editGenerationSource(text: string): Promise<void> {
    await this.savedGeneration.edit(text);
  }

async saveGenerationSource(): Promise<void> {
    await this.savedGeneration.save();
  }

async saveGenerationOtherEntry(text: string): Promise<void> {
    await this.savedGeneration.saveOther(text);
  }

async setGenerationEnabled(enabled: boolean): Promise<void> {
    this.savedGeneration.setEnabled(enabled);
  }

async dirtyGenerationOtherEntry(text: string): Promise<void> {
    this.savedGeneration.dirtyOther(text);
  }

async replaceGenerationSavedConfiguration(text: string): Promise<void> {
    await this.savedGeneration.replaceSavedConfiguration(text);
  }

async saveUnrelatedGenerationSource(text: string): Promise<void> {
    await this.savedGeneration.saveUnrelated(text);
  }

async requestGenerationSaveSnapshot(text: string, version: number): Promise<void> {
    this.savedGeneration.request(text, version);
  }

async keepGenerationImplementation(path: string, body: string): Promise<void> {
    await this.savedGeneration.keepImplementation(path, body);
  }

async awaitGenerationSettlement(): Promise<void> {
    await this.savedGeneration.settle();
  }

async awaitGenerationPermission(): Promise<void> {
    await this.savedGeneration.awaitPermission();
  }

async dirtyGenerationTarget(path: string, text: string): Promise<void> {
    await this.savedGeneration.dirtyTarget(path, text);
  }

async releaseGenerationPermission(): Promise<void> {
    this.savedGeneration.releasePermission();
  }

async editNativeGenerationSource(text: string): Promise<void> {
    await this.nativeGeneration.edit(text);
  }

async saveNativeGenerationSource(): Promise<void> {
    await this.nativeGeneration.save();
  }

async saveNativeGenerationOtherEntry(text: string): Promise<void> {
    await this.nativeGeneration.saveOther(text);
  }

async setNativeGenerationEnabled(enabled: boolean): Promise<void> {
    await this.nativeGeneration.setEnabled(enabled);
  }

async dirtyNativeGenerationOtherEntry(text: string): Promise<void> {
    await this.nativeGeneration.dirtyOther(text);
  }

async selectOtherGenerationConfiguration(): Promise<void> {
    await this.nativeGeneration.selectOther();
  }

async selectOriginalGenerationConfiguration(): Promise<void> {
    await this.nativeGeneration.selectOriginal();
  }

async awaitNativeGeneration(): Promise<void> {
    await this.nativeGeneration.settle();
  }

async keepNativeGenerationImplementation(path: string, body: string): Promise<void> {
    await this.nativeGeneration.keepImplementation(path, body);
  }

async dirtyHiddenGenerationTarget(path: string, body: string): Promise<void> {
    await this.nativeGeneration.dirtyTarget(path, body);
  }

async generationStatus(): Promise<string> {
    return this.savedGeneration.status();
  }

async generationExplanation(): Promise<string> {
    return this.savedGeneration.explanation();
  }

async generationFileIncludes(path: string, text: string): Promise<boolean> {
    return await this.savedGeneration.fileIncludes(path, text);
  }

async generationTargetTreeUnchanged(): Promise<boolean> {
    return await this.savedGeneration.unchanged();
  }

async generationWorkerStarts(): Promise<number> {
    return this.savedGeneration.starts();
  }

async generationTargetDirtyTextIncludes(text: string): Promise<boolean> {
    return this.savedGeneration.dirtyTextIncludes(text);
  }

async nativeGenerationRuntimeVersion(): Promise<string> {
    return await this.nativeGeneration.runtimeVersion();
  }

async nativeGenerationStatus(): Promise<string> {
    return await this.nativeGeneration.status();
  }

async nativeGenerationExplanation(): Promise<string> {
    return await this.nativeGeneration.explanation();
  }

async nativeGenerationFileIncludes(path: string, text: string): Promise<boolean> {
    return await this.nativeGeneration.fileIncludes(path, text);
  }

async nativeGenerationTargetTreeUnchanged(): Promise<boolean> {
    return await this.nativeGeneration.unchanged();
  }

async nativeGenerationDiagramIncludes(text: string): Promise<boolean> {
    return await this.nativeGeneration.diagramIncludes(text);
  }

async nativeGenerationDirtyTextIncludes(text: string): Promise<boolean> {
    return await this.nativeGeneration.dirtyTextIncludes(text);
  }

async nativeGenerationLaunchExplanationIncludes(text: string): Promise<boolean> {
    return await this.nativeGeneration.launchExplanationIncludes(text);
  }

async sourceNavigation(): Promise<void> {
    this.navigationRecording = SourceNavigationRecording.create();
  }

async localDefinitionEditor(entry: string): Promise<void> {
        this.nativeDefinition = await (await InstalledExpecEditor.prepare()).definitionEditor({ 'entry.expec': entry });
    }

async importedDefinitionEditor(entry: string, imported: string): Promise<void> {
        this.nativeDefinition = await (await InstalledExpecEditor.prepare()).definitionEditor({ 'entry.expec': entry, 'book.expec': imported });
    }

async ambiguousDefinitionEditor(entry: string, first: string, second: string): Promise<void> {
        this.nativeDefinition = await (await InstalledExpecEditor.prepare()).definitionEditor({ 'entry.expec': entry, 'shopping.expec': first, 'shipping.expec': second });
    }

async definitionConversion(text: string): Promise<void> {
    this.definitionConversionRecording = new SourceDefinitionConversion(text);
  }

async saveNavigationSource(source: SourceDocument): Promise<void> {
    this.navigationRecording.savedSource(source);
  }

async openNavigationSource(source: SourceDocument, version: number): Promise<void> {
    this.navigationRecording.opened(source, version);
  }

async changeNavigationSource(source: SourceDocument, version: number): Promise<void> {
    this.navigationRecording.changed(source, version);
  }

async closeNavigationSource(uri: string): Promise<void> {
    this.navigationRecording.closed(uri);
  }

async disposeNavigation(): Promise<void> {
    this.navigationRecording.disposed();
  }

async requestSourceDefinition(uri: string, version: number, line: number, column: number): Promise<void> {
    this.navigationRecording.request(uri, version, line, column);
  }

async rememberNavigationWork(): Promise<void> {
    this.navigationRecording.rememberWork();
  }

async editDefinitionEntry(text: string): Promise<void> {
        await this.nativeDefinition.editEntry(text);
    }

async editDefinitionImport(text: string): Promise<void> {
        await this.nativeDefinition.editImport(text);
    }

async goToNativeDefinition(line: number, column: number): Promise<void> {
        await this.nativeDefinition.goTo(line, column);
    }

async requestConvertedDefinition(line: number, character: number): Promise<void> {
    this.definitionConversionRecording.request(line, character);
  }

async hasSourceDefinition(request: number): Promise<boolean> {
    return this.navigationRecording.reply(request) !== undefined;
  }

async sourceDefinitionUri(request: number): Promise<string> {
    return this.navigationRecording.definition(request).source.uri;
  }

async sourceDefinitionText(request: number): Promise<string> {
    return this.navigationRecording.definition(request).source.text;
  }

async sourceDefinitionName(request: number): Promise<string> {
    return this.navigationRecording.name(request);
  }

async sourceDefinitionStartLine(request: number): Promise<number> {
    return this.navigationRecording.start(request).line;
  }

async sourceDefinitionStartColumn(request: number): Promise<number> {
    return this.navigationRecording.start(request).column;
  }

async sourceDefinitionEndLine(request: number): Promise<number> {
    return this.navigationRecording.end(request).line;
  }

async sourceDefinitionEndColumn(request: number): Promise<number> {
    return this.navigationRecording.end(request).column;
  }

async navigationWorkUnchanged(): Promise<boolean> {
    return this.navigationRecording.workUnchanged();
  }

async navigationHasProblem(uri: string, code: string): Promise<boolean> {
    return this.navigationRecording.hasProblem(uri, code);
  }

async nativeDefinitionCount(): Promise<number> {
        return this.nativeDefinition.observation().locations.length;
    }

async nativeDefinitionFileName(): Promise<string> {
        return this.nativeDefinition.locationFileName();
    }

async nativeDefinitionUsesOwnedFile(fileName: string): Promise<boolean> {
        return this.nativeDefinition.locationUsesOwnedFile(fileName);
    }

async nativeDefinitionName(): Promise<string> {
        return this.nativeDefinition.observation().locations[0]?.name ?? '';
    }

async nativeDefinitionStartLine(): Promise<number> {
        const location = this.nativeDefinition.observation().locations[0]; return location ? location.range.start.line + 1 : -1;
    }

async nativeDefinitionStartColumn(): Promise<number> {
        const location = this.nativeDefinition.observation().locations[0]; return location ? location.range.start.character + 1 : -1;
    }

async nativeDefinitionEndLine(): Promise<number> {
        const location = this.nativeDefinition.observation().locations[0]; return location ? location.range.end.line + 1 : -1;
    }

async nativeDefinitionEndColumn(): Promise<number> {
        const location = this.nativeDefinition.observation().locations[0]; return location ? location.range.end.character + 1 : -1;
    }

async activeDefinitionFileName(): Promise<string> {
        return this.nativeDefinition.activeFileName();
    }

async activeDefinitionUsesOwnedFile(fileName: string): Promise<boolean> {
        return this.nativeDefinition.activeUsesOwnedFile(fileName);
    }

async activeDefinitionLine(): Promise<number> {
        return this.nativeDefinition.observation().active.line + 1;
    }

async activeDefinitionColumn(): Promise<number> {
        return this.nativeDefinition.observation().active.character + 1;
    }

async definitionEntryIsDirty(): Promise<boolean> {
        return this.nativeDefinition.observation().entryDirty;
    }

async definitionImportIsDirty(): Promise<boolean> {
        return this.nativeDefinition.observation().importDirty;
    }

async definitionFilesUnchanged(): Promise<boolean> {
        return await this.nativeDefinition.filesUnchanged();
    }

async definitionEditorHasProblem(code: string): Promise<boolean> {
        return this.nativeDefinition.observation().problemCodes.includes(code);
    }

async hasConvertedDefinition(request: number): Promise<boolean> {
    return this.definitionConversionRecording.reply(request) !== undefined;
  }

async convertedDefinitionName(request: number): Promise<string> {
    return this.definitionConversionRecording.name(request);
  }

async convertedDefinitionStartLine(request: number): Promise<number> {
    return this.definitionConversionRecording.location(request).range.start.line;
  }

async convertedDefinitionStartCharacter(request: number): Promise<number> {
    return this.definitionConversionRecording.location(request).range.start.character;
  }

async convertedDefinitionEndLine(request: number): Promise<number> {
    return this.definitionConversionRecording.location(request).range.end.line;
  }

async convertedDefinitionEndCharacter(request: number): Promise<number> {
    return this.definitionConversionRecording.location(request).range.end.character;
  }

async sourceHovers(): Promise<void> {
    this.sourceHoverRecording = SourceHoverRecording.create();
  }

async localHoverEditor(text: string): Promise<void> {
    this.nativeHover = await (await InstalledExpecEditor.prepare()).definitionEditor({ 'entry.expec': text });
  }

async importedHoverEditor(entry: string, imported: string): Promise<void> {
    this.nativeHover = await (await InstalledExpecEditor.prepare()).definitionEditor({ 'entry.expec': entry, 'book.expec': imported });
  }

async hoverConversion(text: string): Promise<void> {
    this.hoverConversionRecording = new SourceHoverConversion(text);
  }

async saveHoverSource(source: SourceDocument): Promise<void> {
    this.sourceHoverRecording.savedSource(source);
  }

async openHoverSource(source: SourceDocument, version: number): Promise<void> {
    this.sourceHoverRecording.opened(source, version);
  }

async changeHoverSource(source: SourceDocument, version: number): Promise<void> {
    this.sourceHoverRecording.changed(source, version);
  }

async closeHoverSource(uri: string): Promise<void> {
    this.sourceHoverRecording.closed(uri);
  }

async disposeSourceHovers(): Promise<void> {
    this.sourceHoverRecording.disposed();
  }

async requestDeclarationHover(uri: string, version: number, line: number, column: number): Promise<void> {
    this.sourceHoverRecording.request(uri, version, line, column);
  }

async rememberHoverWork(): Promise<void> {
    this.sourceHoverRecording.rememberWork();
  }

async editHoverImport(text: string): Promise<void> {
    await this.nativeHover.editImport(text);
  }

async requestNativeHover(line: number, column: number): Promise<void> {
    await this.nativeHover.hover(line, column);
  }

async requestConvertedHover(line: number, character: number): Promise<void> {
    this.hoverConversionRecording.request(line, character);
  }

async hasDeclarationHover(request: number): Promise<boolean> {
    return this.sourceHoverRecording.reply(request) !== undefined;
  }

async declarationHoverUri(request: number): Promise<string> {
    return this.sourceHoverRecording.hover(request).source.uri;
  }

async declarationHoverSource(request: number): Promise<string> {
    return this.sourceHoverRecording.hover(request).source.text;
  }

async declarationHoverName(request: number): Promise<string> {
    return this.sourceHoverRecording.name(request);
  }

async declarationHoverSignature(request: number): Promise<string> {
    return this.sourceHoverRecording.hover(request).signature;
  }

async declarationHoverDescription(request: number): Promise<string> {
    return this.sourceHoverRecording.hover(request).description;
  }

async declarationHoverStartLine(request: number): Promise<number> {
    return this.sourceHoverRecording.start(request).line;
  }

async declarationHoverStartColumn(request: number): Promise<number> {
    return this.sourceHoverRecording.start(request).column;
  }

async declarationHoverEndLine(request: number): Promise<number> {
    return this.sourceHoverRecording.end(request).line;
  }

async declarationHoverEndColumn(request: number): Promise<number> {
    return this.sourceHoverRecording.end(request).column;
  }

async hoverWorkUnchanged(): Promise<boolean> {
    return this.sourceHoverRecording.workUnchanged();
  }

async hoverHasProblem(uri: string, code: string): Promise<boolean> {
    return this.sourceHoverRecording.hasProblem(uri, code);
  }

async nativeHoverCount(): Promise<number> {
    return this.nativeHover.hoverObservation().hovers.length;
  }

async nativeHoverMarkdown(): Promise<string> {
    return this.nativeHover.hoverObservation().hovers[0]?.markdown ?? '';
  }

async nativeHoverName(): Promise<string> {
    return this.nativeHover.hoverObservation().hovers[0]?.name ?? '';
  }

async nativeHoverStartLine(): Promise<number> {
    const hover = this.nativeHover.hoverObservation().hovers[0];
    return hover ? hover.range.start.line + 1 : 0;
  }

async nativeHoverStartColumn(): Promise<number> {
    const hover = this.nativeHover.hoverObservation().hovers[0];
    return hover ? hover.range.start.character + 1 : 0;
  }

async nativeHoverEndColumn(): Promise<number> {
    const hover = this.nativeHover.hoverObservation().hovers[0];
    return hover ? hover.range.end.character + 1 : 0;
  }

async hoverFilesUnchanged(): Promise<boolean> {
    return this.nativeHover.filesUnchanged();
  }

async hoverImportIsDirty(): Promise<boolean> {
    return this.nativeHover.observation().importDirty;
  }

async hoverEntryVersionUnchanged(): Promise<boolean> {
    return this.nativeHover.entryVersionUnchanged();
  }

async hasConvertedHover(request: number): Promise<boolean> {
    return this.hoverConversionRecording.reply(request) !== undefined;
  }

async convertedHoverMarkdown(request: number): Promise<string> {
    return this.hoverConversionRecording.markdown(request);
  }

async convertedHoverName(request: number): Promise<string> {
    return this.hoverConversionRecording.name(request);
  }

async convertedHoverStartCharacter(request: number): Promise<number> {
    return this.hoverConversionRecording.information(request).range!.start.character;
  }

async convertedHoverEndCharacter(request: number): Promise<number> {
    return this.hoverConversionRecording.information(request).range!.end.character;
  }

async documentOutline(): Promise<void> {
    throw new Error("Not implemented: workspace.documentOutline");
  }

async outlineEditor(fileName: string, initialText: string): Promise<void> {
    throw new Error("Not implemented: workspace.outlineEditor");
  }

async outlineAdapterDocument(uri: string, text: string, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.outlineAdapterDocument");
  }

async saveOutlineSource(source: SourceDocument): Promise<void> {
    throw new Error("Not implemented: workspace.saveOutlineSource");
  }

async openOutlineSource(source: SourceDocument, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.openOutlineSource");
  }

async changeOutlineSource(source: SourceDocument, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.changeOutlineSource");
  }

async closeOutlineSource(uri: string): Promise<void> {
    throw new Error("Not implemented: workspace.closeOutlineSource");
  }

async disposeDocumentOutline(): Promise<void> {
    throw new Error("Not implemented: workspace.disposeDocumentOutline");
  }

async requestDocumentOutline(uri: string, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.requestDocumentOutline");
  }

async rememberOutlineWork(): Promise<void> {
    throw new Error("Not implemented: workspace.rememberOutlineWork");
  }

async attemptOutlineReplyMutation(request: number): Promise<void> {
    throw new Error("Not implemented: workspace.attemptOutlineReplyMutation");
  }

async editOutlineWithoutSaving(text: string): Promise<void> {
    throw new Error("Not implemented: workspace.editOutlineWithoutSaving");
  }

async requestEditorOutline(): Promise<void> {
    throw new Error("Not implemented: workspace.requestEditorOutline");
  }

async changeOutlineAdapterDocument(text: string, version: number): Promise<void> {
    throw new Error("Not implemented: workspace.changeOutlineAdapterDocument");
  }

async requestOutlineAdapter(version: number): Promise<void> {
    throw new Error("Not implemented: workspace.requestOutlineAdapter");
  }

async hasDocumentOutline(request: number): Promise<boolean> {
    throw new Error("Not implemented: workspace.hasDocumentOutline");
  }

async outlineSourceUri(request: number): Promise<string> {
    throw new Error("Not implemented: workspace.outlineSourceUri");
  }

async outlineSourceText(request: number): Promise<string> {
    throw new Error("Not implemented: workspace.outlineSourceText");
  }

async outlineRootCount(request: number): Promise<number> {
    throw new Error("Not implemented: workspace.outlineRootCount");
  }

async outlineDeclarationCount(request: number): Promise<number> {
    throw new Error("Not implemented: workspace.outlineDeclarationCount");
  }

async outlineName(request: number, path: Array<number>): Promise<string> {
    throw new Error("Not implemented: workspace.outlineName");
  }

async outlineKind(request: number, path: Array<number>): Promise<string> {
    throw new Error("Not implemented: workspace.outlineKind");
  }

async outlineChildCount(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineChildCount");
  }

async outlineStartLine(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineStartLine");
  }

async outlineStartColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineStartColumn");
  }

async outlineEndLine(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineEndLine");
  }

async outlineEndColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineEndColumn");
  }

async outlineNameLine(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineNameLine");
  }

async outlineNameColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineNameColumn");
  }

async outlineNameEndColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.outlineNameEndColumn");
  }

async outlineWorkUnchanged(): Promise<boolean> {
    throw new Error("Not implemented: workspace.outlineWorkUnchanged");
  }

async outlineHasProblem(uri: string, code: string): Promise<boolean> {
    throw new Error("Not implemented: workspace.outlineHasProblem");
  }

async nativeOutlineRootCount(request: number): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineRootCount");
  }

async nativeOutlineDeclarationCount(request: number): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineDeclarationCount");
  }

async nativeOutlineName(request: number, path: Array<number>): Promise<string> {
    throw new Error("Not implemented: workspace.nativeOutlineName");
  }

async nativeOutlineKind(request: number, path: Array<number>): Promise<string> {
    throw new Error("Not implemented: workspace.nativeOutlineKind");
  }

async nativeOutlineChildCount(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineChildCount");
  }

async nativeOutlineStartLine(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineStartLine");
  }

async nativeOutlineStartColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineStartColumn");
  }

async nativeOutlineEndLine(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineEndLine");
  }

async nativeOutlineEndColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineEndColumn");
  }

async nativeOutlineNameLine(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineNameLine");
  }

async nativeOutlineNameColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineNameColumn");
  }

async nativeOutlineNameEndColumn(request: number, path: Array<number>): Promise<number> {
    throw new Error("Not implemented: workspace.nativeOutlineNameEndColumn");
  }

async nativeOutlineRangesContainNames(request: number): Promise<boolean> {
    throw new Error("Not implemented: workspace.nativeOutlineRangesContainNames");
  }

async nativeOutlineSavedText(): Promise<string> {
    throw new Error("Not implemented: workspace.nativeOutlineSavedText");
  }

async nativeOutlineOpenText(): Promise<string> {
    throw new Error("Not implemented: workspace.nativeOutlineOpenText");
  }

async nativeOutlineOpenIsDirty(): Promise<boolean> {
    throw new Error("Not implemented: workspace.nativeOutlineOpenIsDirty");
  }

async nativeOutlineWorkspaceUnchanged(): Promise<boolean> {
    throw new Error("Not implemented: workspace.nativeOutlineWorkspaceUnchanged");
  }
}

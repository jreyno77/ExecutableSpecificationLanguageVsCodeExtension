import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "./comparison.js";
import { WorkspaceDriver } from "../driver/workspace.js";
import { SourceDocument } from "../../src/core/SourceDocument.js";
import { OutputTab } from "../../src/core/OutputTab.js";
export class Workspace {
  constructor(private readonly driver: WorkspaceDriver) {}
  readonly document: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" };
  readonly tabs: Array<OutputTab> = [{ ["id"]: "uml", ["label"]: "UML", ["status"]: "ready", ["documents"]: [{ ["path"]: "structure.d2", ["mediaType"]: "text/vnd.d2", ["content"]: "Book: { title: Text }" }] }, { ["id"]: "typescript", ["label"]: "TypeScript", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.ts", ["mediaType"]: "text/typescript", ["content"]: "export interface Book { title: string }" }] }, { ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Book" }] }];
  readonly previews: Array<OutputTab> = [{ ["id"]: "uml", ["label"]: "UML", ["status"]: "ready", ["documents"]: [{ ["path"]: "structure.d2", ["mediaType"]: "text/vnd.d2", ["content"]: "Book: { title: Text }" }] }, { ["id"]: "typescript", ["label"]: "TypeScript", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.ts", ["mediaType"]: "text/typescript", ["content"]: "export interface Book { title: string }" }] }, { ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Book" }] }];
  readonly editedDocument: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {\n  title: Text\n  copies: Number\n}" };
  readonly previewTabs: Array<OutputTab> = [{ ["id"]: "markdown", ["label"]: "Markdown", ["status"]: "ready", ["documents"]: [{ ["path"]: "Book.md", ["mediaType"]: "text/markdown", ["content"]: "# Edited Book" }] }];
  async connectedOutputs(previews: Array<OutputTab>, generateOnSave: boolean): Promise<void> {
    return await this.driver.connectedOutputs(previews, generateOnSave);
  }
  async openOutputTabs(): Promise<void> {
    return await this.driver.openOutputTabs();
  }
  async editorCoreReturns(tabs: Array<OutputTab>): Promise<void> {
    return await this.driver.editorCoreReturns(tabs);
  }
  async requestPreview(source: SourceDocument): Promise<void> {
    return await this.driver.requestPreview(source);
  }
  async saveSource(source: SourceDocument): Promise<void> {
    return await this.driver.saveSource(source);
  }
  async presentOutputs(tabs: Array<OutputTab>): Promise<void> {
    return await this.driver.presentOutputs(tabs);
  }
  async selectOutput(id: string): Promise<void> {
    return await this.driver.selectOutput(id);
  }
  async changeEditorDocument(source: SourceDocument): Promise<void> {
    return await this.driver.changeEditorDocument(source);
  }
  async saveEditorDocument(source: SourceDocument): Promise<void> {
    return await this.driver.saveEditorDocument(source);
  }
  async returnedTabs(): Promise<Array<OutputTab>> {
    return await this.driver.returnedTabs();
  }
  async outputPreviewRequests(): Promise<Array<SourceDocument>> {
    return await this.driver.outputPreviewRequests();
  }
  async outputGenerationRequests(): Promise<Array<SourceDocument>> {
    return await this.driver.outputGenerationRequests();
  }
  async outputLabels(): Promise<Array<string>> {
    return await this.driver.outputLabels();
  }
  async selectedOutputContent(): Promise<string> {
    return await this.driver.selectedOutputContent();
  }
  async corePreviewRequests(): Promise<Array<SourceDocument>> {
    return await this.driver.corePreviewRequests();
  }
  async coreSaveRequests(): Promise<Array<SourceDocument>> {
    return await this.driver.coreSaveRequests();
  }
  async editorPreviewTabs(): Promise<Array<OutputTab>> {
    return await this.driver.editorPreviewTabs();
  }
  async expectPreviewTabs(expected: Array<OutputTab>): Promise<void> {
    const actual = await this.driver.returnedTabs();
    expectData(actual, expected);
  }
  async expectOutputRequests(previews: Array<SourceDocument>, generations: Array<SourceDocument>): Promise<void> {
    const actualPreviews = await this.driver.outputPreviewRequests();
    const actualGenerations = await this.driver.outputGenerationRequests();
    expectData(actualPreviews, previews);
    expectData(actualGenerations, generations);
  }
  async expectOutputLabels(expected: Array<string>): Promise<void> {
    const actual = await this.driver.outputLabels();
    expectData(actual, expected);
  }
  async expectOutputContent(expected: string): Promise<void> {
    const actual = await this.driver.selectedOutputContent();
    expectData(actual, expected);
  }
  async expectCoreRequests(previews: Array<SourceDocument>, saves: Array<SourceDocument>): Promise<void> {
    const actualPreviews = await this.driver.corePreviewRequests();
    const actualSaves = await this.driver.coreSaveRequests();
    expectData(actualPreviews, previews);
    expectData(actualSaves, saves);
  }
  async expectEditorPreviews(expected: Array<OutputTab>): Promise<void> {
    const actual = await this.driver.editorPreviewTabs();
    expectData(actual, expected);
  }

async disposeOutputTabs(): Promise<void> {
    return await this.driver.disposeOutputTabs();
  }

async outputHostExists(): Promise<boolean> {
    return await this.driver.outputHostExists();
  }

async expectOutputHostRetained(): Promise<void> {
    const actual = await this.driver.outputHostExists();
    expectData(actual, true);
  }

readonly latestDocument: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {\n  title: Text\n  copies: Number\n  available: Boolean\n}" };

readonly untitledDocument: SourceDocument = { ["uri"]: "untitled:Untitled-1", ["text"]: "type Draft {" };

async preparedExpecEditor(): Promise<void> {
    return await this.driver.preparedExpecEditor();
  }

async preparedExpecGrammar(): Promise<void> {
    return await this.driver.preparedExpecGrammar();
  }

async openSyntaxFile(fileName: string, text: string): Promise<void> {
    return await this.driver.openSyntaxFile(fileName, text);
  }

async tokenizeSyntax(text: string): Promise<void> {
    return await this.driver.tokenizeSyntax(text);
  }

async editorLanguageId(): Promise<string> {
    return await this.driver.editorLanguageId();
  }

async syntaxScopeAt(line: number, column: number): Promise<string> {
    return await this.driver.syntaxScopeAt(line, column);
  }

async expectEditorLanguage(expected: string): Promise<void> {
    const actual = await this.driver.editorLanguageId();
    expectData(actual, expected);
  }

async expectSyntaxScope(line: number, column: number, expected: string): Promise<void> {
    const actual = await this.driver.syntaxScopeAt(line, column);
    expectData(actual, expected);
  }

readonly syntaxDeclaration: string = "type Book { title: Text }";

readonly syntaxString: string = "component Store {\n  capability save() {\n    promises \"type is text // still text\"\n  }\n}";

readonly syntaxComment: string = "// type Book { title: Text }\nconcept Store {}";

readonly syntaxQuotedName: string = "concept `type // Book` {}";

async syntaxAnalysis(): Promise<void> {
    return await this.driver.syntaxAnalysis();
  }

async diagnosticEditor(fileName: string, initialText: string): Promise<void> {
    return await this.driver.diagnosticEditor(fileName, initialText);
  }

async openSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.openSource(source, version);
  }

async changeSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.changeSource(source, version);
  }

async closeSource(uri: string): Promise<void> {
    return await this.driver.closeSource(uri);
  }

async tryOpeningSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.tryOpeningSource(source, version);
  }

async tryChangingSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.tryChangingSource(source, version);
  }

async editWithoutSaving(text: string): Promise<void> {
    return await this.driver.editWithoutSaving(text);
  }

async editQuickly(first: string, latest: string): Promise<void> {
    return await this.driver.editQuickly(first, latest);
  }

async closeEditedDocument(): Promise<void> {
    return await this.driver.closeEditedDocument();
  }

async publishedVersion(uri: string): Promise<number> {
    return await this.driver.publishedVersion(uri);
  }

async publicationCount(uri: string): Promise<number> {
    return await this.driver.publicationCount(uri);
  }

async syntaxProblemCount(uri: string): Promise<number> {
    return await this.driver.syntaxProblemCount(uri);
  }

async syntaxExplanation(uri: string): Promise<string> {
    return await this.driver.syntaxExplanation(uri);
  }

async syntaxStartLine(uri: string): Promise<number> {
    return await this.driver.syntaxStartLine(uri);
  }

async syntaxStartColumn(uri: string): Promise<number> {
    return await this.driver.syntaxStartColumn(uri);
  }

async syntaxEndLine(uri: string): Promise<number> {
    return await this.driver.syntaxEndLine(uri);
  }

async syntaxEndColumn(uri: string): Promise<number> {
    return await this.driver.syntaxEndColumn(uri);
  }

async clearCount(uri: string): Promise<number> {
    return await this.driver.clearCount(uri);
  }

async invalidVersionRejected(): Promise<boolean> {
    return await this.driver.invalidVersionRejected();
  }

async previouslyVisibleProblemCount(): Promise<number> {
    return await this.driver.previouslyVisibleProblemCount();
  }

async editorProblemCount(): Promise<number> {
    return await this.driver.editorProblemCount();
  }

async editorProblemMessage(): Promise<string> {
    return await this.driver.editorProblemMessage();
  }

async editorProblemIsError(): Promise<boolean> {
    return await this.driver.editorProblemIsError();
  }

async editorProblemStartLine(): Promise<number> {
    return await this.driver.editorProblemStartLine();
  }

async editorProblemStartColumn(): Promise<number> {
    return await this.driver.editorProblemStartColumn();
  }

async editorProblemEndLine(): Promise<number> {
    return await this.driver.editorProblemEndLine();
  }

async editorProblemEndColumn(): Promise<number> {
    return await this.driver.editorProblemEndColumn();
  }

async savedDocumentText(): Promise<string> {
    return await this.driver.savedDocumentText();
  }

async openDocumentText(): Promise<string> {
    return await this.driver.openDocumentText();
  }

async openDocumentIsDirty(): Promise<boolean> {
    return await this.driver.openDocumentIsDirty();
  }

async expectSyntaxProblem(uri: string, version: number, line: number, column: number): Promise<void> {
    const actualVersion = await this.driver.publishedVersion(uri);
    const count = await this.driver.syntaxProblemCount(uri);
    const explanation = await this.driver.syntaxExplanation(uri);
    const startLine = await this.driver.syntaxStartLine(uri);
    const startColumn = await this.driver.syntaxStartColumn(uri);
    const endLine = await this.driver.syntaxEndLine(uri);
    const endColumn = await this.driver.syntaxEndColumn(uri);
    expectData(actualVersion, version);
    expectData(count, 1);
    expect(!comparisonEqual(explanation, "")).toBe(true);
    expectData(startLine, line);
    expectData(startColumn, column);
    expectData(endLine, line);
    expectData(endColumn, column);
  }

async expectNoSyntaxProblems(uri: string, version: number): Promise<void> {
    const actualVersion = await this.driver.publishedVersion(uri);
    const count = await this.driver.syntaxProblemCount(uri);
    expectData(actualVersion, version);
    expectData(count, 0);
  }

async expectPublications(uri: string, expected: number): Promise<void> {
    const actual = await this.driver.publicationCount(uri);
    expectData(actual, expected);
  }

async expectClears(uri: string, expected: number): Promise<void> {
    const actual = await this.driver.clearCount(uri);
    expectData(actual, expected);
  }

async expectInvalidVersionRejected(): Promise<void> {
    const rejected = await this.driver.invalidVersionRejected();
    expectData(rejected, true);
  }

async expectEditorSyntaxProblem(line: number, column: number, endLine: number, endColumn: number): Promise<void> {
    const count = await this.driver.editorProblemCount();
    const explanation = await this.driver.editorProblemMessage();
    const isError = await this.driver.editorProblemIsError();
    const actualLine = await this.driver.editorProblemStartLine();
    const actualColumn = await this.driver.editorProblemStartColumn();
    const actualEndLine = await this.driver.editorProblemEndLine();
    const actualEndColumn = await this.driver.editorProblemEndColumn();
    expectData(count, 1);
    expect(!comparisonEqual(explanation, "")).toBe(true);
    expectData(isError, true);
    expectData(actualLine, line);
    expectData(actualColumn, column);
    expectData(actualEndLine, endLine);
    expectData(actualEndColumn, endColumn);
  }

async expectResolvedEditorProblem(): Promise<void> {
    const previous = await this.driver.previouslyVisibleProblemCount();
    expectData(previous, 1);
    const actual = await this.driver.editorProblemCount();
    expectData(actual, 0);
  }

async expectUnsavedText(current: string, saved: string): Promise<void> {
    const actualCurrent = await this.driver.openDocumentText();
    const actualSaved = await this.driver.savedDocumentText();
    const dirty = await this.driver.openDocumentIsDirty();
    expectData(actualCurrent, current);
    expectData(actualSaved, saved);
    expectData(dirty, true);
  }

readonly broken: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {\n  title: Text\n" };

readonly corrected: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {\n  title: Text\n}" };

readonly other: SourceDocument = { ["uri"]: "untitled:Untitled-1", ["text"]: "type Draft { value: Unknown }" };

async semanticAnalysis(): Promise<void> {
    return await this.driver.semanticAnalysis();
  }

async importedEditor(entryText: string, dependencyText: string): Promise<void> {
    return await this.driver.importedEditor(entryText, dependencyText);
  }

async missingImportedEditor(entryText: string): Promise<void> {
    return await this.driver.missingImportedEditor(entryText);
  }

async saveSemanticSource(source: SourceDocument): Promise<void> {
    return await this.driver.saveSemanticSource(source);
  }

async removeSemanticSource(uri: string): Promise<void> {
    return await this.driver.removeSemanticSource(uri);
  }

async openSemanticSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.openSemanticSource(source, version);
  }

async changeSemanticSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.changeSemanticSource(source, version);
  }

async closeSemanticSource(uri: string): Promise<void> {
    return await this.driver.closeSemanticSource(uri);
  }

async saveImportedText(text: string): Promise<void> {
    return await this.driver.saveImportedText(text);
  }

async deleteImportedFile(): Promise<void> {
    return await this.driver.deleteImportedFile();
  }

async semanticProblemCode(uri: string): Promise<string> {
    return await this.driver.semanticProblemCode(uri);
  }

async semanticProblemCount(uri: string): Promise<number> {
    return await this.driver.semanticProblemCount(uri);
  }

async semanticStartLine(uri: string): Promise<number> {
    return await this.driver.semanticStartLine(uri);
  }

async semanticStartColumn(uri: string): Promise<number> {
    return await this.driver.semanticStartColumn(uri);
  }

async semanticEndColumn(uri: string): Promise<number> {
    return await this.driver.semanticEndColumn(uri);
  }

async hasCheckedSpecification(uri: string): Promise<boolean> {
    return await this.driver.hasCheckedSpecification(uri);
  }

async semanticDeferredCount(uri: string): Promise<number> {
    return await this.driver.semanticDeferredCount(uri);
  }

async semanticPublicationCount(uri: string): Promise<number> {
    return await this.driver.semanticPublicationCount(uri);
  }

async semanticPublishedVersion(uri: string): Promise<number> {
    return await this.driver.semanticPublishedVersion(uri);
  }

async editorProblemCode(): Promise<string> {
    return await this.driver.editorProblemCode();
  }

async entryVersionUnchanged(): Promise<boolean> {
    return await this.driver.entryVersionUnchanged();
  }

async expectSemanticProblem(uri: string, code: string, line: number, column: number, endColumn: number): Promise<void> {
    const actualCode = await this.driver.semanticProblemCode(uri);
    const count = await this.driver.semanticProblemCount(uri);
    const actualLine = await this.driver.semanticStartLine(uri);
    const actualColumn = await this.driver.semanticStartColumn(uri);
    const actualEnd = await this.driver.semanticEndColumn(uri);
    const checked = await this.driver.hasCheckedSpecification(uri);
    expectData(actualCode, code);
    expectData(count, 1);
    expectData(actualLine, line);
    expectData(actualColumn, column);
    expectData(actualEnd, endColumn);
    expectData(checked, false);
  }

async expectCheckedSource(uri: string): Promise<void> {
    const checked = await this.driver.hasCheckedSpecification(uri);
    const problems = await this.driver.semanticProblemCount(uri);
    const deferred = await this.driver.semanticDeferredCount(uri);
    expectData(checked, true);
    expectData(problems, 0);
    expectData(deferred, 0);
  }

async expectSemanticPublications(uri: string, count: number, version: number): Promise<void> {
    const actualCount = await this.driver.semanticPublicationCount(uri);
    const actualVersion = await this.driver.semanticPublishedVersion(uri);
    expectData(actualCount, count);
    expectData(actualVersion, version);
  }

async expectEditorSemanticCode(code: string): Promise<void> {
    const actualCode = await this.driver.editorProblemCode();
    expectData(actualCode, code);
  }

async expectUnchangedEntryVersion(): Promise<void> {
    const unchanged = await this.driver.entryVersionUnchanged();
    expectData(unchanged, true);
  }

readonly basket: SourceDocument = { ["uri"]: "file:///workspace/src/basket.expec", ["text"]: "use Book from \"./book.expec\"\ntype Basket { book: Book }" };

readonly book: SourceDocument = { ["uri"]: "file:///workspace/src/book.expec", ["text"]: "type Book { title: Text }" };

readonly renamedBook: SourceDocument = { ["uri"]: "file:///workspace/src/book.expec", ["text"]: "type Magazine { title: Text }" };

async connectionWorkspace(configuration: string, writable: boolean): Promise<void> {
    return await this.driver.connectionWorkspace(configuration, writable);
  }

async missingConnectionWorkspace(writable: boolean): Promise<void> {
    return await this.driver.missingConnectionWorkspace(writable);
  }

async connectionSidebar(configuration: string, directories: Array<string>): Promise<void> {
    return await this.driver.connectionSidebar(configuration, directories);
  }

async unconfiguredSidebar(directories: Array<string>): Promise<void> {
    return await this.driver.unconfiguredSidebar(directories);
  }

async inspectConnection(): Promise<void> {
    return await this.driver.inspectConnection();
  }

async chooseProjectDirectory(name: string): Promise<void> {
    return await this.driver.chooseProjectDirectory(name);
  }

async confirmRequestedConfigurationSave(): Promise<void> {
    return await this.driver.confirmRequestedConfigurationSave();
  }

async rejectRequestedConfigurationSave(message: string): Promise<void> {
    return await this.driver.rejectRequestedConfigurationSave(message);
  }

async makeProjectUnavailable(name: string): Promise<void> {
    return await this.driver.makeProjectUnavailable(name);
  }

async restoreProjectDirectory(name: string): Promise<void> {
    return await this.driver.restoreProjectDirectory(name);
  }

async replaceConnectionConfiguration(text: string): Promise<void> {
    return await this.driver.replaceConnectionConfiguration(text);
  }

async observeSidebar(): Promise<void> {
    return await this.driver.observeSidebar();
  }

async chooseProjectInSidebar(directory: string): Promise<void> {
    return await this.driver.chooseProjectInSidebar(directory);
  }

async saveSidebarConfiguration(text: string): Promise<void> {
    return await this.driver.saveSidebarConfiguration(text);
  }

async removeSidebarProject(directory: string): Promise<void> {
    return await this.driver.removeSidebarProject(directory);
  }

async restoreSidebarProject(directory: string): Promise<void> {
    return await this.driver.restoreSidebarProject(directory);
  }

async editConfigurationWithoutSaving(text: string): Promise<void> {
    return await this.driver.editConfigurationWithoutSaving(text);
  }

async connectionStatus(): Promise<string> {
    return await this.driver.connectionStatus();
  }

async configuredProjectName(): Promise<string> {
    return await this.driver.configuredProjectName();
  }

async verifiedProjectName(): Promise<string> {
    return await this.driver.verifiedProjectName();
  }

async connectionMessage(): Promise<string> {
    return await this.driver.connectionMessage();
  }

async requestedConfigurationSaves(): Promise<number> {
    return await this.driver.requestedConfigurationSaves();
  }

async actualConfigurationExists(): Promise<boolean> {
    return await this.driver.actualConfigurationExists();
  }

async requestedProjectName(): Promise<string> {
    return await this.driver.requestedProjectName();
  }

async requestedSettings(): Promise<string> {
    return await this.driver.requestedSettings();
  }

async connectedPublications(): Promise<number> {
    return await this.driver.connectedPublications();
  }

async unavailablePublications(): Promise<number> {
    return await this.driver.unavailablePublications();
  }

async connectionPublications(): Promise<number> {
    return await this.driver.connectionPublications();
  }

async sidebarConnectionStatus(): Promise<string> {
    return await this.driver.sidebarConnectionStatus();
  }

async sidebarProjectName(): Promise<string> {
    return await this.driver.sidebarProjectName();
  }

async sidebarConnectionExplanation(): Promise<string> {
    return await this.driver.sidebarConnectionExplanation();
  }

async sidebarSavedProjectName(): Promise<string> {
    return await this.driver.sidebarSavedProjectName();
  }

async sidebarSavedConfiguration(): Promise<string> {
    return await this.driver.sidebarSavedConfiguration();
  }

async sidebarUnsavedConfiguration(): Promise<string> {
    return await this.driver.sidebarUnsavedConfiguration();
  }

async expectConnection(status: string, target: string, verified: string): Promise<void> {
    const actualStatus = await this.driver.connectionStatus();
    const actualTarget = await this.driver.configuredProjectName();
    const actualVerified = await this.driver.verifiedProjectName();
    expectData(actualStatus, status);
    expectData(actualTarget, target);
    expectData(actualVerified, verified);
  }

async expectSaveRequests(expected: number): Promise<void> {
    const actual = await this.driver.requestedConfigurationSaves();
    expectData(actual, expected);
  }

async expectConnectionMessage(expected: string): Promise<void> {
    const actual = await this.driver.connectionMessage();
    expectData(actual, expected);
  }

async expectConfigurationProblem(): Promise<void> {
    const actualMessage = await this.driver.connectionMessage();
    expect(!comparisonEqual(actualMessage, "")).toBe(true);
    const actualSaves = await this.driver.requestedConfigurationSaves();
    expectData(actualSaves, 0);
  }

async expectUnwrittenConfiguration(): Promise<void> {
    const exists = await this.driver.actualConfigurationExists();
    const connected = await this.driver.connectedPublications();
    expectData(exists, false);
    expectData(connected, 0);
  }

async expectRequestedProject(expected: string): Promise<void> {
    const actual = await this.driver.requestedProjectName();
    expectData(actual, expected);
  }

async expectPreservedSettings(expected: string): Promise<void> {
    const actual = await this.driver.requestedSettings();
    expectData(actual, expected);
  }

async expectRecoveredConnection(): Promise<void> {
    const unavailable = await this.driver.unavailablePublications();
    expectData(unavailable, 1);
    const actualStatus = await this.driver.connectionStatus();
    const actualTarget = await this.driver.configuredProjectName();
    const actualVerified = await this.driver.verifiedProjectName();
    expectData(actualStatus, "connected");
    expectData(actualTarget, "alpha");
    expectData(actualVerified, "alpha");
  }

async expectConnectionPublications(expected: number): Promise<void> {
    const actual = await this.driver.connectionPublications();
    expectData(actual, expected);
  }

async expectSidebarConnection(status: string, project: string): Promise<void> {
    const actualStatus = await this.driver.sidebarConnectionStatus();
    const actualProject = await this.driver.sidebarProjectName();
    const explanation = await this.driver.sidebarConnectionExplanation();
    expectData(actualStatus, status);
    expectData(actualProject, project);
    expect(!comparisonEqual(explanation, "")).toBe(true);
  }

async expectSidebarSavedProject(project: string): Promise<void> {
    const actual = await this.driver.sidebarSavedProjectName();
    expectData(actual, project);
  }

async expectSidebarConfigurationPreserved(saved: string, unsaved: string): Promise<void> {
    const actualSaved = await this.driver.sidebarSavedConfiguration();
    const actualUnsaved = await this.driver.sidebarUnsavedConfiguration();
    expectData(actualSaved, saved);
    expectData(actualUnsaved, unsaved);
  }

readonly alphaConfiguration: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/main.expec\"]},\"outputs\":[],\"project\":{\"root\":\"./alpha\"}}";

readonly betaConfiguration: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/main.expec\"]},\"outputs\":[],\"project\":{\"root\":\"./beta\"}}";

readonly configuredSettings: string = "{\"formatVersion\":1,\"version\":\"1.2.3\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[],\"packages\":[{\"alias\":\"storage\",\"name\":\"npm:storage\",\"version\":\"1.0.0\",\"phases\":[\"runtime\"]}],\"project\":{\"root\":\"./alpha\"}}";

readonly configuredShop: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"project\":{\"root\":\"shop\"},\"build\":{\"entries\":[\"src/main.expec\"]},\"outputs\":[]}";

readonly configuredLibrary: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"project\":{\"root\":\"library\"},\"build\":{\"entries\":[\"src/main.expec\"]},\"outputs\":[]}";

async previewAuthoring(configuration: string): Promise<void> {
    return await this.driver.previewAuthoring(configuration);
  }

async gatedPreviewAuthoring(configuration: string, id: string): Promise<void> {
    return await this.driver.gatedPreviewAuthoring(configuration, id);
  }

async undecodableTextOutput(): Promise<void> {
    return await this.driver.undecodableTextOutput();
  }

async unsupportedBinaryOutput(): Promise<void> {
    return await this.driver.unsupportedBinaryOutput();
  }

async previewEditor(initialText: string, configuration: string): Promise<void> {
    return await this.driver.previewEditor(initialText, configuration);
  }

async openPreviewSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.openPreviewSource(source, version);
  }

async changePreviewSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.changePreviewSource(source, version);
  }

async changePreviewConfiguration(configuration: string): Promise<void> {
    return await this.driver.changePreviewConfiguration(configuration);
  }

async settleCurrentPreviews(): Promise<void> {
    return await this.driver.settleCurrentPreviews();
  }

async awaitReadyOutput(id: string): Promise<void> {
    return await this.driver.awaitReadyOutput(id);
  }

async rememberPreviewOutput(id: string): Promise<void> {
    return await this.driver.rememberPreviewOutput(id);
  }

async armNextOutput(id: string): Promise<void> {
    return await this.driver.armNextOutput(id);
  }

async savePreviewImport(uri: string, text: string): Promise<void> {
    return await this.driver.savePreviewImport(uri, text);
  }

async closePreviewSource(uri: string): Promise<void> {
    return await this.driver.closePreviewSource(uri);
  }

async disposePreviews(): Promise<void> {
    return await this.driver.disposePreviews();
  }

async awaitHeldOutput(id: string): Promise<void> {
    return await this.driver.awaitHeldOutput(id);
  }

async releaseHeldOutput(id: string): Promise<void> {
    return await this.driver.releaseHeldOutput(id);
  }

async drainPreviewWork(): Promise<void> {
    return await this.driver.drainPreviewWork();
  }

async selectOutputDocument(path: string): Promise<void> {
    return await this.driver.selectOutputDocument(path);
  }

async setDiagramZoom(percent: number): Promise<void> {
    return await this.driver.setDiagramZoom(percent);
  }

async resetDiagramZoom(): Promise<void> {
    return await this.driver.resetDiagramZoom();
  }

async scrollDiagram(horizontal: number, vertical: number): Promise<void> {
    return await this.driver.scrollDiagram(horizontal, vertical);
  }

async showOutputPreviews(): Promise<void> {
    return await this.driver.showOutputPreviews();
  }

async editPreviewWithoutSaving(text: string): Promise<void> {
    return await this.driver.editPreviewWithoutSaving(text);
  }

async savePreviewConfiguration(text: string): Promise<void> {
    return await this.driver.savePreviewConfiguration(text);
  }

async selectPreviewOutput(id: string): Promise<void> {
    return await this.driver.selectPreviewOutput(id);
  }

async selectPreviewDocument(path: string): Promise<void> {
    return await this.driver.selectPreviewDocument(path);
  }

async closePreviewPanel(): Promise<void> {
    return await this.driver.closePreviewPanel();
  }

async zoomPreviewDiagram(): Promise<void> {
    return await this.driver.zoomPreviewDiagram();
  }

async scrollPreviewDiagram(): Promise<void> {
    return await this.driver.scrollPreviewDiagram();
  }

async resetPreviewZoom(): Promise<void> {
    return await this.driver.resetPreviewZoom();
  }

async previewOutputIds(): Promise<Array<string>> {
    return await this.driver.previewOutputIds();
  }

async previewOutputLabels(): Promise<Array<string>> {
    return await this.driver.previewOutputLabels();
  }

async previewOutputStatus(id: string): Promise<string> {
    return await this.driver.previewOutputStatus(id);
  }

async rememberedPreviewOutputStatus(id: string): Promise<string> {
    return await this.driver.rememberedPreviewOutputStatus(id);
  }

async rememberedPreviewDocumentMediaType(id: string, path: string): Promise<string> {
    return await this.driver.rememberedPreviewDocumentMediaType(id, path);
  }

async rememberedPreviewDocumentContains(id: string, path: string, content: string): Promise<boolean> {
    return await this.driver.rememberedPreviewDocumentContains(id, path, content);
  }

async previewDocumentPaths(id: string): Promise<Array<string>> {
    return await this.driver.previewDocumentPaths(id);
  }

async previewDocumentMediaType(id: string, path: string): Promise<string> {
    return await this.driver.previewDocumentMediaType(id, path);
  }

async previewDocumentContains(id: string, path: string, content: string): Promise<boolean> {
    return await this.driver.previewDocumentContains(id, path, content);
  }

async previewSvgHasLabel(id: string, path: string, label: string): Promise<boolean> {
    return await this.driver.previewSvgHasLabel(id, path, label);
  }

async previewExplanationContains(id: string, text: string): Promise<boolean> {
    return await this.driver.previewExplanationContains(id, text);
  }

async previewViewExplanation(): Promise<string> {
    return await this.driver.previewViewExplanation();
  }

async previewSourceUri(): Promise<string> {
    return await this.driver.previewSourceUri();
  }

async previewSourceVersion(): Promise<number> {
    return await this.driver.previewSourceVersion();
  }

async previewTargetPathsAndBytesUnchanged(): Promise<boolean> {
    return await this.driver.previewTargetPathsAndBytesUnchanged();
  }

async outputInvocationCount(id: string): Promise<number> {
    return await this.driver.outputInvocationCount(id);
  }

async outputMaximumConcurrentInvocations(id: string): Promise<number> {
    return await this.driver.outputMaximumConcurrentInvocations(id);
  }

async postDisposalPublicationCount(): Promise<number> {
    return await this.driver.postDisposalPublicationCount();
  }

async selectedOutputId(): Promise<string> {
    return await this.driver.selectedOutputId();
  }

async selectedOutputStatus(): Promise<string> {
    return await this.driver.selectedOutputStatus();
  }

async selectedOutputExplanation(): Promise<string> {
    return await this.driver.selectedOutputExplanation();
  }

async selectedDocumentPaths(): Promise<Array<string>> {
    return await this.driver.selectedDocumentPaths();
  }

async selectedDocumentPath(): Promise<string> {
    return await this.driver.selectedDocumentPath();
  }

async diagramImageLoaded(): Promise<boolean> {
    return await this.driver.diagramImageLoaded();
  }

async diagramZoomPercent(): Promise<number> {
    return await this.driver.diagramZoomPercent();
  }

async diagramDisplayedWidth(): Promise<number> {
    return await this.driver.diagramDisplayedWidth();
  }

async diagramScrollLeft(): Promise<number> {
    return await this.driver.diagramScrollLeft();
  }

async diagramScrollTop(): Promise<number> {
    return await this.driver.diagramScrollTop();
  }

async nativePreviewOutputIds(): Promise<Array<string>> {
    return await this.driver.nativePreviewOutputIds();
  }

async nativePreviewSelectedId(id: string, path: string): Promise<string> {
    return await this.driver.nativePreviewSelectedId(id, path);
  }

async nativePreviewDocumentPath(id: string, path: string): Promise<string> {
    return await this.driver.nativePreviewDocumentPath(id, path);
  }

async nativePreviewDocumentMediaType(id: string, path: string): Promise<string> {
    return await this.driver.nativePreviewDocumentMediaType(id, path);
  }

async nativePreviewTextIncludes(id: string, path: string, text: string): Promise<boolean> {
    return await this.driver.nativePreviewTextIncludes(id, path, text);
  }

async nativePreviewObservedStatus(id: string, path: string): Promise<string> {
    return await this.driver.nativePreviewObservedStatus(id, path);
  }

async nativePreviewBeforeEditStatus(): Promise<string> {
    return await this.driver.nativePreviewBeforeEditStatus();
  }

async nativePreviewBeforeConfigurationIds(): Promise<Array<string>> {
    return await this.driver.nativePreviewBeforeConfigurationIds();
  }

async nativePreviewClosedTextIncludes(text: string): Promise<boolean> {
    return await this.driver.nativePreviewClosedTextIncludes(text);
  }

async nativePreviewZoomHistory(): Promise<Array<number>> {
    return await this.driver.nativePreviewZoomHistory();
  }

async nativePreviewDocumentCount(): Promise<number> {
    return await this.driver.nativePreviewDocumentCount();
  }

async nativePreviewStatus(): Promise<string> {
    return await this.driver.nativePreviewStatus();
  }

async nativePreviewExplanation(): Promise<string> {
    return await this.driver.nativePreviewExplanation();
  }

async nativePreviewImageDecoded(id: string, path: string): Promise<boolean> {
    return await this.driver.nativePreviewImageDecoded(id, path);
  }

async nativePreviewSvgContainsLabel(id: string, path: string, text: string): Promise<boolean> {
    return await this.driver.nativePreviewSvgContainsLabel(id, path, text);
  }

async nativePreviewZoomPercent(): Promise<number> {
    return await this.driver.nativePreviewZoomPercent();
  }

async nativePreviewDiagramOverflow(): Promise<boolean> {
    return await this.driver.nativePreviewDiagramOverflow();
  }

async nativePreviewDiagramScrolled(): Promise<boolean> {
    return await this.driver.nativePreviewDiagramScrolled();
  }

async nativePreviewSavedText(): Promise<string> {
    return await this.driver.nativePreviewSavedText();
  }

async nativePreviewOpenText(): Promise<string> {
    return await this.driver.nativePreviewOpenText();
  }

async nativePreviewSourceDirty(): Promise<boolean> {
    return await this.driver.nativePreviewSourceDirty();
  }

async nativePreviewFilesUnchanged(): Promise<boolean> {
    return await this.driver.nativePreviewFilesUnchanged();
  }

async expectConfiguredOutputs(ids: Array<string>, labels: Array<string>): Promise<void> {
    const actualIds = await this.driver.previewOutputIds();
    const actualLabels = await this.driver.previewOutputLabels();
    expectData(actualIds, ids);
    expectData(actualLabels, labels);
  }

async expectPreviewStatus(id: string, status: string): Promise<void> {
    const actual = await this.driver.previewOutputStatus(id);
    expectData(actual, status);
  }

async expectPreviewDocument(id: string, path: string, mediaType: string, content: string): Promise<void> {
    const actualMediaType = await this.driver.previewDocumentMediaType(id, path);
    const contains = await this.driver.previewDocumentContains(id, path, content);
    expectData(actualMediaType, mediaType);
    expectData(contains, true);
  }

async expectEarlierReadyDocument(id: string, path: string, mediaType: string, content: string): Promise<void> {
    const earlierStatus = await this.driver.rememberedPreviewOutputStatus(id);
    const earlierMediaType = await this.driver.rememberedPreviewDocumentMediaType(id, path);
    const earlierContains = await this.driver.rememberedPreviewDocumentContains(id, path, content);
    expectData(earlierStatus, "ready");
    expectData(earlierMediaType, mediaType);
    expectData(earlierContains, true);
  }

async expectPreviewSvgLabel(id: string, path: string, label: string): Promise<void> {
    const actualMediaType = await this.driver.previewDocumentMediaType(id, path);
    const hasLabel = await this.driver.previewSvgHasLabel(id, path, label);
    expectData(actualMediaType, "image/svg+xml");
    expectData(hasLabel, true);
  }

async expectPreviewExplanation(id: string, text: string): Promise<void> {
    const contains = await this.driver.previewExplanationContains(id, text);
    expectData(contains, true);
  }

async expectNoPreviewDocuments(id: string): Promise<void> {
    const paths = await this.driver.previewDocumentPaths(id);
    expectData(paths, this.emptyPaths);
  }

async expectCurrentPreviewSource(uri: string, version: number): Promise<void> {
    const actualUri = await this.driver.previewSourceUri();
    const actualVersion = await this.driver.previewSourceVersion();
    expectData(actualUri, uri);
    expectData(actualVersion, version);
  }

async expectTargetsPreserved(): Promise<void> {
    const unchanged = await this.driver.previewTargetPathsAndBytesUnchanged();
    expectData(unchanged, true);
  }

async expectBoundedOutputWork(id: string, invocations: number): Promise<void> {
    const actualInvocations = await this.driver.outputInvocationCount(id);
    const actualMaximum = await this.driver.outputMaximumConcurrentInvocations(id);
    expectData(actualInvocations, invocations);
    expectData(actualMaximum, 1);
  }

async expectNoPublicationAfterDisposal(): Promise<void> {
    const actual = await this.driver.postDisposalPublicationCount();
    expectData(actual, 0);
  }

async expectNoSelectedPreview(): Promise<void> {
    const ids = await this.driver.previewOutputIds();
    const explanation = await this.driver.previewViewExplanation();
    expectData(ids, this.emptyPaths);
    expect(!comparisonEqual(explanation, "")).toBe(true);
  }

async expectSelectedOutput(id: string): Promise<void> {
    const actual = await this.driver.selectedOutputId();
    expectData(actual, id);
  }

async expectOutputStatus(status: string, explanation: string): Promise<void> {
    const actualStatus = await this.driver.selectedOutputStatus();
    const actualExplanation = await this.driver.selectedOutputExplanation();
    const documents = await this.driver.selectedDocumentPaths();
    expectData(actualStatus, status);
    expectData(actualExplanation, explanation);
    expectData(documents, this.emptyDocumentPaths);
  }

async expectSelectedDocument(path: string, paths: Array<string>): Promise<void> {
    const actual = await this.driver.selectedDocumentPath();
    const actualPaths = await this.driver.selectedDocumentPaths();
    expectData(actual, path);
    expectData(actualPaths, paths);
  }

async expectLoadedDiagram(percent: number, width: number): Promise<void> {
    const loaded = await this.driver.diagramImageLoaded();
    const actualPercent = await this.driver.diagramZoomPercent();
    const actualWidth = await this.driver.diagramDisplayedWidth();
    expectData(loaded, true);
    expectData(actualPercent, percent);
    expectData(actualWidth, width);
  }

async expectDiagramScroll(horizontal: number, vertical: number): Promise<void> {
    const actualHorizontal = await this.driver.diagramScrollLeft();
    const actualVertical = await this.driver.diagramScrollTop();
    expectData(actualHorizontal, horizontal);
    expectData(actualVertical, vertical);
  }

async expectNativePreviewOutputs(ids: Array<string>): Promise<void> {
    const actual = await this.driver.nativePreviewOutputIds();
    expectData(actual, ids);
  }

async expectNativePreviewText(id: string, path: string, mediaType: string, text: string): Promise<void> {
    const selected = await this.driver.nativePreviewSelectedId(id, path);
    const actualPath = await this.driver.nativePreviewDocumentPath(id, path);
    const actualMediaType = await this.driver.nativePreviewDocumentMediaType(id, path);
    const includesText = await this.driver.nativePreviewTextIncludes(id, path, text);
    const status = await this.driver.nativePreviewObservedStatus(id, path);
    expectData(selected, id);
    expectData(actualPath, path);
    expectData(actualMediaType, mediaType);
    expectData(includesText, true);
    expectData(status, "ready");
  }

async expectNativePreviewBlocked(): Promise<void> {
    const status = await this.driver.nativePreviewStatus();
    const explanation = await this.driver.nativePreviewExplanation();
    const previous = await this.driver.nativePreviewBeforeEditStatus();
    const documents = await this.driver.nativePreviewDocumentCount();
    expectData(previous, "ready");
    expectData(documents, 0);
    expectData(status, "blocked");
    expect(!comparisonEqual(explanation, "")).toBe(true);
  }

async expectNativePreviewDiagram(id: string, path: string, label: string): Promise<void> {
    const decoded = await this.driver.nativePreviewImageDecoded(id, path);
    const actualLabel = await this.driver.nativePreviewSvgContainsLabel(id, path, label);
    const mediaType = await this.driver.nativePreviewDocumentMediaType(id, path);
    expectData(decoded, true);
    expectData(actualLabel, true);
    expectData(mediaType, "image/svg+xml");
  }

async expectNativePreviewUnsaved(saved: string, open: string): Promise<void> {
    const actualSaved = await this.driver.nativePreviewSavedText();
    const actualOpen = await this.driver.nativePreviewOpenText();
    const dirty = await this.driver.nativePreviewSourceDirty();
    const unchanged = await this.driver.nativePreviewFilesUnchanged();
    expectData(actualSaved, saved);
    expectData(actualOpen, open);
    expectData(dirty, true);
    expectData(unchanged, true);
  }

async expectNativePreviewZoom(percent: number): Promise<void> {
    const actual = await this.driver.nativePreviewZoomPercent();
    expectData(actual, percent);
  }

async expectNativePreviewScrollable(): Promise<void> {
    const overflow = await this.driver.nativePreviewDiagramOverflow();
    const scrolled = await this.driver.nativePreviewDiagramScrolled();
    expectData(overflow, true);
    expectData(scrolled, true);
  }

async expectNativePreviewPriorOutputs(ids: Array<string>): Promise<void> {
    const actual = await this.driver.nativePreviewBeforeConfigurationIds();
    expectData(actual, ids);
  }

async expectClosedPreviewText(text: string): Promise<void> {
    const actual = await this.driver.nativePreviewClosedTextIncludes(text);
    expectData(actual, true);
  }

async expectNativePreviewZoomHistory(history: Array<number>): Promise<void> {
    const actual = await this.driver.nativePreviewZoomHistory();
    expectData(actual, history);
  }

readonly emptyPaths: Array<string> = [];

readonly threeOutputs: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"uml\",\"options\":{\"directory\":\"draft/uml\",\"views\":[\"structure\"]}},{\"id\":\"typescript\",\"options\":{\"directory\":\"draft/types\"}},{\"id\":\"markdown\",\"options\":{\"directory\":\"draft/docs\"}}]}";

readonly textOutputs: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"typescript\",\"options\":{\"directory\":\"draft/types\"}},{\"id\":\"markdown\",\"options\":{\"directory\":\"draft/docs\"}}]}";

readonly typeScriptOnly: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"typescript\",\"options\":{\"directory\":\"draft/types\"}}]}";

readonly emptyDocumentPaths: Array<string> = [];

readonly diagrams: Array<OutputTab> = [{ ["id"]: "uml", ["label"]: "UML", ["status"]: "ready", ["documents"]: [{ ["path"]: "structure.d2", ["mediaType"]: "text/vnd.d2", ["content"]: "Book: { title: Text }" }, { ["path"]: "structure.svg", ["mediaType"]: "image/svg+xml", ["content"]: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1800\" height=\"1200\" viewBox=\"0 0 1800 1200\"><rect width=\"1800\" height=\"1200\" fill=\"white\"/><text x=\"40\" y=\"60\" font-size=\"20\">Book</text></svg>" }] }];

readonly revisedDiagrams: Array<OutputTab> = [{ ["id"]: "uml", ["label"]: "UML", ["status"]: "ready", ["documents"]: [{ ["path"]: "notes.d2", ["mediaType"]: "text/vnd.d2", ["content"]: "Novel: { title: Number }" }, { ["path"]: "structure.svg", ["mediaType"]: "image/svg+xml", ["content"]: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1800\" height=\"1200\" viewBox=\"0 0 1800 1200\"><rect width=\"1800\" height=\"1200\" fill=\"white\"/><text x=\"40\" y=\"60\" font-size=\"20\">Novel</text></svg>" }] }];

readonly configuredPreviews: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"uml\",\"options\":{\"directory\":\"draft/uml\",\"views\":[\"structure\"]}},{\"id\":\"typescript\",\"options\":{\"directory\":\"draft/types\"}},{\"id\":\"markdown\",\"options\":{\"directory\":\"draft/docs\"}}]}";

readonly revisedPreviews: string = "{\"formatVersion\":1,\"version\":\"0.1.0\",\"build\":{\"entries\":[\"src/library.expec\"]},\"outputs\":[{\"id\":\"markdown\",\"options\":{\"directory\":\"revised/docs\"}}]}";

readonly largeBookSource: string = "type Book { title: Text }\ntype Shelf1 { book: Book }\ntype Shelf2 { book: Book }\ntype Shelf3 { book: Book }\ntype Shelf4 { book: Book }\ntype Shelf5 { book: Book }\ntype Shelf6 { book: Book }\ntype Shelf7 { book: Book }\ntype Shelf8 { book: Book }\ntype Shelf9 { book: Book }\ntype Shelf10 { book: Book }\ntype Shelf11 { book: Book }\ntype Shelf12 { book: Book }\ntype Shelf13 { book: Book }\ntype Shelf14 { book: Book }\ntype Shelf15 { book: Book }\ntype Shelf16 { book: Book }\ntype Shelf17 { book: Book }\ntype Shelf18 { book: Book }\ntype Shelf19 { book: Book }\ntype Shelf20 { book: Book }";

async savedGenerationWorkspace(source: string, otherEntry: string, enabled: boolean): Promise<void> {
    return await this.driver.savedGenerationWorkspace(source, otherEntry, enabled);
  }

async heldGenerationWorkspace(source: string, otherEntry: string): Promise<void> {
    return await this.driver.heldGenerationWorkspace(source, otherEntry);
  }

async generationEditor(source: string, otherEntry: string, enabled: boolean): Promise<void> {
    return await this.driver.generationEditor(source, otherEntry, enabled);
  }

async generationEditorWithOutputs(source: string, otherEntry: string, enabled: boolean): Promise<void> {
    return await this.driver.generationEditorWithOutputs(source, otherEntry, enabled);
  }

async generationEditorWithoutRuntime(source: string): Promise<void> {
    return await this.driver.generationEditorWithoutRuntime(source);
  }

async editGenerationSource(text: string): Promise<void> {
    return await this.driver.editGenerationSource(text);
  }

async saveGenerationSource(): Promise<void> {
    return await this.driver.saveGenerationSource();
  }

async saveGenerationOtherEntry(text: string): Promise<void> {
    return await this.driver.saveGenerationOtherEntry(text);
  }

async setGenerationEnabled(enabled: boolean): Promise<void> {
    return await this.driver.setGenerationEnabled(enabled);
  }

async dirtyGenerationOtherEntry(text: string): Promise<void> {
    return await this.driver.dirtyGenerationOtherEntry(text);
  }

async replaceGenerationSavedConfiguration(text: string): Promise<void> {
    return await this.driver.replaceGenerationSavedConfiguration(text);
  }

async saveUnrelatedGenerationSource(text: string): Promise<void> {
    return await this.driver.saveUnrelatedGenerationSource(text);
  }

async requestGenerationSaveSnapshot(text: string, version: number): Promise<void> {
    return await this.driver.requestGenerationSaveSnapshot(text, version);
  }

async keepGenerationImplementation(path: string, body: string): Promise<void> {
    return await this.driver.keepGenerationImplementation(path, body);
  }

async awaitGenerationSettlement(): Promise<void> {
    return await this.driver.awaitGenerationSettlement();
  }

async awaitGenerationPermission(): Promise<void> {
    return await this.driver.awaitGenerationPermission();
  }

async dirtyGenerationTarget(path: string, text: string): Promise<void> {
    return await this.driver.dirtyGenerationTarget(path, text);
  }

async releaseGenerationPermission(): Promise<void> {
    return await this.driver.releaseGenerationPermission();
  }

async editNativeGenerationSource(text: string): Promise<void> {
    return await this.driver.editNativeGenerationSource(text);
  }

async saveNativeGenerationSource(): Promise<void> {
    return await this.driver.saveNativeGenerationSource();
  }

async saveNativeGenerationOtherEntry(text: string): Promise<void> {
    return await this.driver.saveNativeGenerationOtherEntry(text);
  }

async setNativeGenerationEnabled(enabled: boolean): Promise<void> {
    return await this.driver.setNativeGenerationEnabled(enabled);
  }

async dirtyNativeGenerationOtherEntry(text: string): Promise<void> {
    return await this.driver.dirtyNativeGenerationOtherEntry(text);
  }

async selectOtherGenerationConfiguration(): Promise<void> {
    return await this.driver.selectOtherGenerationConfiguration();
  }

async selectOriginalGenerationConfiguration(): Promise<void> {
    return await this.driver.selectOriginalGenerationConfiguration();
  }

async awaitNativeGeneration(): Promise<void> {
    return await this.driver.awaitNativeGeneration();
  }

async keepNativeGenerationImplementation(path: string, body: string): Promise<void> {
    return await this.driver.keepNativeGenerationImplementation(path, body);
  }

async dirtyHiddenGenerationTarget(path: string, body: string): Promise<void> {
    return await this.driver.dirtyHiddenGenerationTarget(path, body);
  }

async generationStatus(): Promise<string> {
    return await this.driver.generationStatus();
  }

async generationExplanation(): Promise<string> {
    return await this.driver.generationExplanation();
  }

async generationFileIncludes(path: string, text: string): Promise<boolean> {
    return await this.driver.generationFileIncludes(path, text);
  }

async generationTargetTreeUnchanged(): Promise<boolean> {
    return await this.driver.generationTargetTreeUnchanged();
  }

async generationWorkerStarts(): Promise<number> {
    return await this.driver.generationWorkerStarts();
  }

async generationTargetDirtyTextIncludes(text: string): Promise<boolean> {
    return await this.driver.generationTargetDirtyTextIncludes(text);
  }

async nativeGenerationRuntimeVersion(): Promise<string> {
    return await this.driver.nativeGenerationRuntimeVersion();
  }

async nativeGenerationStatus(): Promise<string> {
    return await this.driver.nativeGenerationStatus();
  }

async nativeGenerationExplanation(): Promise<string> {
    return await this.driver.nativeGenerationExplanation();
  }

async nativeGenerationFileIncludes(path: string, text: string): Promise<boolean> {
    return await this.driver.nativeGenerationFileIncludes(path, text);
  }

async nativeGenerationTargetTreeUnchanged(): Promise<boolean> {
    return await this.driver.nativeGenerationTargetTreeUnchanged();
  }

async nativeGenerationDiagramIncludes(text: string): Promise<boolean> {
    return await this.driver.nativeGenerationDiagramIncludes(text);
  }

async nativeGenerationDirtyTextIncludes(text: string): Promise<boolean> {
    return await this.driver.nativeGenerationDirtyTextIncludes(text);
  }

async nativeGenerationLaunchExplanationIncludes(text: string): Promise<boolean> {
    return await this.driver.nativeGenerationLaunchExplanationIncludes(text);
  }

async expectGenerationStatus(status: string): Promise<void> {
    const actual = await this.driver.generationStatus();
    expectData(actual, status);
  }

async expectGenerationFile(path: string, text: string): Promise<void> {
    const present = await this.driver.generationFileIncludes(path, text);
    expectData(present, true);
  }

async expectGenerationUntouched(starts: number): Promise<void> {
    const unchanged = await this.driver.generationTargetTreeUnchanged();
    const actualStarts = await this.driver.generationWorkerStarts();
    expectData(unchanged, true);
    expectData(actualStarts, starts);
  }

async expectGenerationRefused(): Promise<void> {
    const status = await this.driver.generationStatus();
    const explanation = await this.driver.generationExplanation();
    expectData(status, "blocked");
    expect(!comparisonEqual(explanation, "")).toBe(true);
  }

async expectGenerationDirtyText(text: string): Promise<void> {
    const present = await this.driver.generationTargetDirtyTextIncludes(text);
    expectData(present, true);
  }

async expectNativeGenerationRuntime(version: string): Promise<void> {
    const actual = await this.driver.nativeGenerationRuntimeVersion();
    expectData(actual, version);
  }

async expectNativeGenerationStatus(status: string): Promise<void> {
    const actual = await this.driver.nativeGenerationStatus();
    expectData(actual, status);
  }

async expectNativeGenerationFile(path: string, text: string): Promise<void> {
    const present = await this.driver.nativeGenerationFileIncludes(path, text);
    expectData(present, true);
  }

async expectNativeGenerationDiagram(text: string): Promise<void> {
    const present = await this.driver.nativeGenerationDiagramIncludes(text);
    expectData(present, true);
  }

async expectNativeGenerationUntouched(): Promise<void> {
    const unchanged = await this.driver.nativeGenerationTargetTreeUnchanged();
    expectData(unchanged, true);
  }

async expectNativeGenerationDirtyRefusal(text: string): Promise<void> {
    const status = await this.driver.nativeGenerationStatus();
    const explanation = await this.driver.nativeGenerationExplanation();
    const present = await this.driver.nativeGenerationDirtyTextIncludes(text);
    expectData(status, "blocked");
    expect(!comparisonEqual(explanation, "")).toBe(true);
    expectData(present, true);
  }

async expectNativeGenerationLaunchFailure(text: string): Promise<void> {
    const status = await this.driver.nativeGenerationStatus();
    const present = await this.driver.nativeGenerationLaunchExplanationIncludes(text);
    expectData(status, "failed");
    expectData(present, true);
  }

readonly generationOtherEntry: string = "type Shelf { copies: Number }";

readonly generationLibraryInitial: string = "component Library { capability count() returns Number }";

readonly generationLibraryChanged: string = "component Library {\n  capability count() returns Number\n  capability title() returns Text\n}";

readonly nativeGenerationLibrary: string = "component Library {\n  public count\n  capability count() returns Number\n}";

readonly nativeGenerationAddition: string = "component Library {\n  public count, title\n  capability count() returns Number\n  capability title() returns Text\n}";

readonly nativeGenerationShelf: string = "type Shelf { copies: Number }";

async sourceNavigation(): Promise<void> {
    return await this.driver.sourceNavigation();
  }

async localDefinitionEditor(entry: string): Promise<void> {
    return await this.driver.localDefinitionEditor(entry);
  }

async importedDefinitionEditor(entry: string, imported: string): Promise<void> {
    return await this.driver.importedDefinitionEditor(entry, imported);
  }

async ambiguousDefinitionEditor(entry: string, first: string, second: string): Promise<void> {
    return await this.driver.ambiguousDefinitionEditor(entry, first, second);
  }

async definitionConversion(text: string): Promise<void> {
    return await this.driver.definitionConversion(text);
  }

async saveNavigationSource(source: SourceDocument): Promise<void> {
    return await this.driver.saveNavigationSource(source);
  }

async openNavigationSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.openNavigationSource(source, version);
  }

async changeNavigationSource(source: SourceDocument, version: number): Promise<void> {
    return await this.driver.changeNavigationSource(source, version);
  }

async closeNavigationSource(uri: string): Promise<void> {
    return await this.driver.closeNavigationSource(uri);
  }

async disposeNavigation(): Promise<void> {
    return await this.driver.disposeNavigation();
  }

async requestSourceDefinition(uri: string, version: number, line: number, column: number): Promise<void> {
    return await this.driver.requestSourceDefinition(uri, version, line, column);
  }

async rememberNavigationWork(): Promise<void> {
    return await this.driver.rememberNavigationWork();
  }

async editDefinitionEntry(text: string): Promise<void> {
    return await this.driver.editDefinitionEntry(text);
  }

async editDefinitionImport(text: string): Promise<void> {
    return await this.driver.editDefinitionImport(text);
  }

async goToNativeDefinition(line: number, column: number): Promise<void> {
    return await this.driver.goToNativeDefinition(line, column);
  }

async requestConvertedDefinition(line: number, character: number): Promise<void> {
    return await this.driver.requestConvertedDefinition(line, character);
  }

async hasSourceDefinition(request: number): Promise<boolean> {
    return await this.driver.hasSourceDefinition(request);
  }

async sourceDefinitionUri(request: number): Promise<string> {
    return await this.driver.sourceDefinitionUri(request);
  }

async sourceDefinitionText(request: number): Promise<string> {
    return await this.driver.sourceDefinitionText(request);
  }

async sourceDefinitionName(request: number): Promise<string> {
    return await this.driver.sourceDefinitionName(request);
  }

async sourceDefinitionStartLine(request: number): Promise<number> {
    return await this.driver.sourceDefinitionStartLine(request);
  }

async sourceDefinitionStartColumn(request: number): Promise<number> {
    return await this.driver.sourceDefinitionStartColumn(request);
  }

async sourceDefinitionEndLine(request: number): Promise<number> {
    return await this.driver.sourceDefinitionEndLine(request);
  }

async sourceDefinitionEndColumn(request: number): Promise<number> {
    return await this.driver.sourceDefinitionEndColumn(request);
  }

async navigationWorkUnchanged(): Promise<boolean> {
    return await this.driver.navigationWorkUnchanged();
  }

async navigationHasProblem(uri: string, code: string): Promise<boolean> {
    return await this.driver.navigationHasProblem(uri, code);
  }

async nativeDefinitionCount(): Promise<number> {
    return await this.driver.nativeDefinitionCount();
  }

async nativeDefinitionFileName(): Promise<string> {
    return await this.driver.nativeDefinitionFileName();
  }

async nativeDefinitionUsesOwnedFile(fileName: string): Promise<boolean> {
    return await this.driver.nativeDefinitionUsesOwnedFile(fileName);
  }

async nativeDefinitionName(): Promise<string> {
    return await this.driver.nativeDefinitionName();
  }

async nativeDefinitionStartLine(): Promise<number> {
    return await this.driver.nativeDefinitionStartLine();
  }

async nativeDefinitionStartColumn(): Promise<number> {
    return await this.driver.nativeDefinitionStartColumn();
  }

async nativeDefinitionEndLine(): Promise<number> {
    return await this.driver.nativeDefinitionEndLine();
  }

async nativeDefinitionEndColumn(): Promise<number> {
    return await this.driver.nativeDefinitionEndColumn();
  }

async activeDefinitionFileName(): Promise<string> {
    return await this.driver.activeDefinitionFileName();
  }

async activeDefinitionUsesOwnedFile(fileName: string): Promise<boolean> {
    return await this.driver.activeDefinitionUsesOwnedFile(fileName);
  }

async activeDefinitionLine(): Promise<number> {
    return await this.driver.activeDefinitionLine();
  }

async activeDefinitionColumn(): Promise<number> {
    return await this.driver.activeDefinitionColumn();
  }

async definitionEntryIsDirty(): Promise<boolean> {
    return await this.driver.definitionEntryIsDirty();
  }

async definitionImportIsDirty(): Promise<boolean> {
    return await this.driver.definitionImportIsDirty();
  }

async definitionFilesUnchanged(): Promise<boolean> {
    return await this.driver.definitionFilesUnchanged();
  }

async definitionEditorHasProblem(code: string): Promise<boolean> {
    return await this.driver.definitionEditorHasProblem(code);
  }

async hasConvertedDefinition(request: number): Promise<boolean> {
    return await this.driver.hasConvertedDefinition(request);
  }

async convertedDefinitionName(request: number): Promise<string> {
    return await this.driver.convertedDefinitionName(request);
  }

async convertedDefinitionStartLine(request: number): Promise<number> {
    return await this.driver.convertedDefinitionStartLine(request);
  }

async convertedDefinitionStartCharacter(request: number): Promise<number> {
    return await this.driver.convertedDefinitionStartCharacter(request);
  }

async convertedDefinitionEndLine(request: number): Promise<number> {
    return await this.driver.convertedDefinitionEndLine(request);
  }

async convertedDefinitionEndCharacter(request: number): Promise<number> {
    return await this.driver.convertedDefinitionEndCharacter(request);
  }

async expectSourceDefinition(request: number, uri: string, text: string, name: string, line: number, column: number, endColumn: number): Promise<void> {
    const present = await this.driver.hasSourceDefinition(request);
    const actualUri = await this.driver.sourceDefinitionUri(request);
    const actualText = await this.driver.sourceDefinitionText(request);
    const actualName = await this.driver.sourceDefinitionName(request);
    const startLine = await this.driver.sourceDefinitionStartLine(request);
    const startColumn = await this.driver.sourceDefinitionStartColumn(request);
    const endLine = await this.driver.sourceDefinitionEndLine(request);
    const actualEnd = await this.driver.sourceDefinitionEndColumn(request);
    expectData(present, true);
    expectData(actualUri, uri);
    expectData(actualText, text);
    expectData(actualName, name);
    expectData(startLine, line);
    expectData(startColumn, column);
    expectData(endLine, line);
    expectData(actualEnd, endColumn);
  }

async expectNoSourceDefinition(request: number): Promise<void> {
    const present = await this.driver.hasSourceDefinition(request);
    expectData(present, false);
  }

async expectNoNavigationAnalysis(): Promise<void> {
    const unchanged = await this.driver.navigationWorkUnchanged();
    expectData(unchanged, true);
  }

async expectNavigationProblem(uri: string, code: string): Promise<void> {
    const present = await this.driver.navigationHasProblem(uri, code);
    expectData(present, true);
  }

async expectNativeSourceDefinition(fileName: string, name: string, line: number, column: number, endColumn: number): Promise<void> {
    const count = await this.driver.nativeDefinitionCount();
    const file = await this.driver.nativeDefinitionFileName();
    const ownedTarget = await this.driver.nativeDefinitionUsesOwnedFile(fileName);
    const actualName = await this.driver.nativeDefinitionName();
    const startLine = await this.driver.nativeDefinitionStartLine();
    const startColumn = await this.driver.nativeDefinitionStartColumn();
    const endLine = await this.driver.nativeDefinitionEndLine();
    const actualEnd = await this.driver.nativeDefinitionEndColumn();
    const activeFile = await this.driver.activeDefinitionFileName();
    const ownedActive = await this.driver.activeDefinitionUsesOwnedFile(fileName);
    const activeLine = await this.driver.activeDefinitionLine();
    const activeColumn = await this.driver.activeDefinitionColumn();
    expectData(count, 1);
    expectData(file, fileName);
    expectData(ownedTarget, true);
    expectData(actualName, name);
    expectData(startLine, line);
    expectData(startColumn, column);
    expectData(endLine, line);
    expectData(actualEnd, endColumn);
    expectData(activeFile, fileName);
    expectData(ownedActive, true);
    expectData(activeLine, line);
    expectData(activeColumn, column);
  }

async expectNoNativeSourceDefinition(): Promise<void> {
    const count = await this.driver.nativeDefinitionCount();
    const activeFile = await this.driver.activeDefinitionFileName();
    const ownedActive = await this.driver.activeDefinitionUsesOwnedFile("entry.expec");
    expectData(count, 0);
    expectData(activeFile, "entry.expec");
    expectData(ownedActive, true);
  }

async expectDefinitionFilesUnchanged(): Promise<void> {
    const unchanged = await this.driver.definitionFilesUnchanged();
    expectData(unchanged, true);
  }

async expectDefinitionBuffersDirty(): Promise<void> {
    const entryDirty = await this.driver.definitionEntryIsDirty();
    const importDirty = await this.driver.definitionImportIsDirty();
    expectData(entryDirty, true);
    expectData(importDirty, true);
  }

async expectDefinitionEditorProblem(code: string): Promise<void> {
    const present = await this.driver.definitionEditorHasProblem(code);
    expectData(present, true);
  }

async expectConvertedDefinition(request: number, name: string, line: number, character: number, endCharacter: number): Promise<void> {
    const present = await this.driver.hasConvertedDefinition(request);
    const actualName = await this.driver.convertedDefinitionName(request);
    const startLine = await this.driver.convertedDefinitionStartLine(request);
    const startCharacter = await this.driver.convertedDefinitionStartCharacter(request);
    const endLine = await this.driver.convertedDefinitionEndLine(request);
    const actualEnd = await this.driver.convertedDefinitionEndCharacter(request);
    expectData(present, true);
    expectData(actualName, name);
    expectData(startLine, line);
    expectData(startCharacter, character);
    expectData(endLine, line);
    expectData(actualEnd, endCharacter);
  }

async expectNoConvertedDefinition(request: number): Promise<void> {
    const present = await this.driver.hasConvertedDefinition(request);
    expectData(present, false);
  }

readonly navigationLocal: SourceDocument = { ["uri"]: "file:///workspace/catalog.expec", ["text"]: "type Book { title: Text }\ntype Basket { book: Book }" };

readonly navigationEntry: SourceDocument = { ["uri"]: "file:///workspace/basket.expec", ["text"]: "use Book from \"./book.expec\"\ntype Basket { book: Book }" };

readonly navigationBook: SourceDocument = { ["uri"]: "file:///workspace/book.expec", ["text"]: "type Book { title: Text }" };

readonly navigationUnicodeBook: SourceDocument = { ["uri"]: "file:///workspace/book.expec", ["text"]: "type Marker { label: Text = \"📚\" }\n\ntype Book { title: Text }" };

readonly nativeDefinitionLocal: string = "type Book { title: Text }\ntype Basket { book: Book }";

readonly nativeDefinitionEntry: string = "use Book from \"./book.expec\"\ntype Basket { book: Book }";

readonly nativeDefinitionBook: string = "type Book { title: Text }";

readonly nativeDefinitionUnicodeEntry: string = "use Book from \"./book.expec\"\ntype Marker { label: Text = \"📚\" }\ntype Basket { book: Book }";

readonly nativeDefinitionUnicodeBook: string = "type Marker { label: Text = \"📚\" }\n\ntype Book { title: Text }";
}

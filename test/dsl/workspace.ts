import { expect } from "vitest";
import { expectData, comparisonEqual, finiteNumber } from "./comparison.js";
import { WorkspaceDriver } from "../driver/workspace.js";
import { SourceDocument } from "../../src/core/SourceDocument.js";
import { OutputTab } from "../../src/core/OutputTab.js";
export class Workspace {
  constructor(private readonly driver: WorkspaceDriver) {}
  readonly document: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book { title: Text }" };
  readonly tabs: Array<OutputTab> = [{ ["id"]: "uml", ["label"]: "UML", ["content"]: "Book: { title: Text }" }, { ["id"]: "typescript", ["label"]: "TypeScript", ["content"]: "export interface Book { title: string }" }, { ["id"]: "markdown", ["label"]: "Markdown", ["content"]: "# Book" }];
  readonly previews: Array<OutputTab> = [{ ["id"]: "uml", ["label"]: "UML", ["content"]: "Book: { title: Text }" }, { ["id"]: "typescript", ["label"]: "TypeScript", ["content"]: "export interface Book { title: string }" }, { ["id"]: "markdown", ["label"]: "Markdown", ["content"]: "# Book" }];
  readonly editedDocument: SourceDocument = { ["uri"]: "file:///workspace/src/library.expec", ["text"]: "type Book {\n  title: Text\n  copies: Number\n}" };
  readonly previewTabs: Array<OutputTab> = [{ ["id"]: "markdown", ["label"]: "Markdown", ["content"]: "# Edited Book" }];
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
}

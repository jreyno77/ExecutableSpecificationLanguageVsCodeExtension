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
}

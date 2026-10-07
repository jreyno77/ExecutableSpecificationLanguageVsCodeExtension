import { OutputTab } from "../../src/core/OutputTab.js";
import { SourceDocument } from "../../src/core/SourceDocument.js";
export class WorkspaceDriver {
  async connectedOutputs(previews: Array<OutputTab>, generateOnSave: boolean): Promise<void> {
    throw new Error("Not implemented: workspace.connectedOutputs");
  }
  async openOutputTabs(): Promise<void> {
    throw new Error("Not implemented: workspace.openOutputTabs");
  }
  async editorCoreReturns(tabs: Array<OutputTab>): Promise<void> {
    throw new Error("Not implemented: workspace.editorCoreReturns");
  }
  async requestPreview(source: SourceDocument): Promise<void> {
    throw new Error("Not implemented: workspace.requestPreview");
  }
  async saveSource(source: SourceDocument): Promise<void> {
    throw new Error("Not implemented: workspace.saveSource");
  }
  async presentOutputs(tabs: Array<OutputTab>): Promise<void> {
    throw new Error("Not implemented: workspace.presentOutputs");
  }
  async selectOutput(id: string): Promise<void> {
    throw new Error("Not implemented: workspace.selectOutput");
  }
  async changeEditorDocument(source: SourceDocument): Promise<void> {
    throw new Error("Not implemented: workspace.changeEditorDocument");
  }
  async saveEditorDocument(source: SourceDocument): Promise<void> {
    throw new Error("Not implemented: workspace.saveEditorDocument");
  }
  async returnedTabs(): Promise<Array<OutputTab>> {
    throw new Error("Not implemented: workspace.returnedTabs");
  }
  async outputPreviewRequests(): Promise<Array<SourceDocument>> {
    throw new Error("Not implemented: workspace.outputPreviewRequests");
  }
  async outputGenerationRequests(): Promise<Array<SourceDocument>> {
    throw new Error("Not implemented: workspace.outputGenerationRequests");
  }
  async outputLabels(): Promise<Array<string>> {
    throw new Error("Not implemented: workspace.outputLabels");
  }
  async selectedOutputContent(): Promise<string> {
    throw new Error("Not implemented: workspace.selectedOutputContent");
  }
  async corePreviewRequests(): Promise<Array<SourceDocument>> {
    throw new Error("Not implemented: workspace.corePreviewRequests");
  }
  async coreSaveRequests(): Promise<Array<SourceDocument>> {
    throw new Error("Not implemented: workspace.coreSaveRequests");
  }
  async editorPreviewTabs(): Promise<Array<OutputTab>> {
    throw new Error("Not implemented: workspace.editorPreviewTabs");
  }

async disposeOutputTabs(): Promise<void> {
    throw new Error("Not implemented: workspace.disposeOutputTabs");
  }

async outputHostExists(): Promise<boolean> {
    throw new Error("Not implemented: workspace.outputHostExists");
  }
}

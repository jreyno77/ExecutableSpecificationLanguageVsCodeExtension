import { WorkspaceCore } from '../../src/core/WorkspaceCore.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import type { OutputTab } from '../../src/core/OutputTab.js';

export class RecordingCore extends WorkspaceCore {
  readonly previews: SourceDocument[] = [];
  readonly saves: SourceDocument[] = [];
  constructor(private readonly tabs: OutputTab[]) {
    super({ preview: () => tabs, generate: () => {} }, false);
  }
  override preview(source: SourceDocument): OutputTab[] {
    this.previews.push(source);
    return this.tabs;
  }
  override sourceSaved(source: SourceDocument): void { this.saves.push(source); }
}

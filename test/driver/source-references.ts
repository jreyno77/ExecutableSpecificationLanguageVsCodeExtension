import { Compiler, LangiumReader, SourceComposer, type Inspection } from 'executable-specification-language';
import { onTestFinished, vi, type MockInstance } from 'vitest';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../src/core/DocumentReport.js';
import type { ReferenceSearch } from '../../src/core/ReferenceSearch.js';
import type { SourceDefinition } from '../../src/core/SourceDefinition.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import { SourceReferences } from '../../src/core/SourceReferences.js';

/** Records real analysis publications and reference replies, without resolving source. */
export class SourceReferencesRecording {
  private readonly references = new SourceReferences();
  private readonly saved = new Map<string, SourceDocument>();
  private readonly inputs = new Map<string, SourceDocument>();
  private readonly reports = new Map<string, DocumentReport>();
  private readonly replies: Array<ReferenceSearch | undefined> = [];
  private acquisitions = 0;
  private baseline?: number[];
  private reading?: MockInstance<LangiumReader['read']>;
  private composing?: MockInstance<SourceComposer['compose']>;
  private compiling?: MockInstance<Compiler['compile']>;
  private readonly inspectionCalls: MockInstance[] = [];
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => {
      this.inputs.set(source.uri, source);
      this.reports.set(source.uri, report);
      this.references.published(source, version, report);
    },
    clear: uri => { this.reports.delete(uri); this.references.closed(uri); },
  }, { localPath: () => undefined, read: uri => { this.acquisitions++; return this.saved.get(uri); } });

  static create(): SourceReferencesRecording {
    const recording = new SourceReferencesRecording();
    onTestFinished(() => recording.cleanup());
    return recording;
  }
  savedSource(source: SourceDocument): void {
    this.saved.set(source.uri, Object.freeze({ ...source }));
    this.analysis.sourceChanged(source.uri);
  }
  opened(source: SourceDocument, version: number): void { this.analysis.opened(source, version); }
  changed(source: SourceDocument, version: number): void { this.analysis.changed(source, version); }
  closed(uri: string): void { this.analysis.closed(uri); }
  disposed(): void { this.references.dispose(); }
  request(uri: string, version: number, line: number, column: number, includeDeclaration: boolean): void {
    const source = this.inputs.get(uri);
    if (!source) throw new Error('No actual input was recorded for ' + uri);
    this.replies.push(this.references.search(uri, version, scalarOffset(source.text, line, column), includeDeclaration));
  }
  reply(request: number): ReferenceSearch | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual reference reply was recorded for request ' + request);
    return this.replies[request - 1];
  }
  search(request: number): ReferenceSearch {
    const result = this.reply(request);
    if (!result) throw new Error('Request ' + request + ' returned no reference search');
    return result;
  }
  location(request: number, location: number): SourceDefinition {
    const locations = this.search(request).locations;
    if (!Number.isInteger(location) || location < 1 || location > locations.length)
      throw new Error('No actual reference location ' + location + ' for request ' + request);
    return locations[location - 1];
  }
  name(request: number, location: number): string {
    const result = this.location(request, location);
    return Array.from(result.source.text).slice(result.startOffset, result.endOffset).join('');
  }
  start(request: number, location: number): { line: number; column: number } {
    const result = this.location(request, location);
    return scalarPosition(result.source.text, result.startOffset);
  }
  end(request: number, location: number): { line: number; column: number } {
    const result = this.location(request, location);
    return scalarPosition(result.source.text, result.endOffset);
  }
  unavailable(request: number, uri: string): boolean {
    return this.search(request).prerequisites.includes('Unavailable source: ' + uri);
  }
  prerequisiteCode(request: number, code: string): boolean {
    return this.search(request).prerequisites.some(value => value.startsWith(code + ': '));
  }
  hasDeferred(request: number): boolean {
    return this.search(request).prerequisites.some(value => value.startsWith('Deferred: '));
  }
  rememberWork(): void {
    this.reading ??= vi.spyOn(LangiumReader.prototype, 'read');
    this.composing ??= vi.spyOn(SourceComposer.prototype, 'compose');
    this.compiling ??= vi.spyOn(Compiler.prototype, 'compile');
    if (!this.inspectionCalls.length) {
      for (const inspection of new Set([...this.reports.values()].flatMap(report => report.inspection ? [report.inspection] : []))) {
        for (const method of ['query', 'read', 'children', 'parent', 'roots'] as const)
          this.inspectionCalls.push(vi.spyOn(inspection, method as keyof Inspection));
      }
    }
    this.baseline = this.work();
  }
  workUnchanged(): boolean {
    if (!this.baseline) throw new Error('Analysis work was not recorded before reference requests');
    return this.work().every((count, index) => count === this.baseline![index]);
  }
  private work(): number[] {
    return [this.reading?.mock.calls.length ?? 0, this.composing?.mock.calls.length ?? 0,
      this.compiling?.mock.calls.length ?? 0, this.acquisitions,
      ...this.inspectionCalls.map(call => call.mock.calls.length)];
  }
  private cleanup(): void {
    this.reading?.mockRestore(); this.composing?.mockRestore(); this.compiling?.mockRestore();
    for (const call of this.inspectionCalls) call.mockRestore();
    this.references.dispose();
  }
}

function scalarOffset(text: string, line: number, column: number): number {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1)
    throw new RangeError('Source positions must be positive integer lines and columns.');
  const lines = text.split('\n'), selected = lines[line - 1];
  if (selected === undefined || column > Array.from(selected).length + 1)
    throw new RangeError('Source position is outside the recorded text.');
  return lines.slice(0, line - 1).reduce((offset, preceding) => offset + Array.from(preceding).length + 1, 0) + column - 1;
}
function scalarPosition(text: string, offset: number): { line: number; column: number } {
  const scalars = Array.from(text);
  if (!Number.isInteger(offset) || offset < 0 || offset > scalars.length)
    throw new RangeError('Reference range is outside its actual captured text.');
  let line = 1, column = 1;
  for (const scalar of scalars.slice(0, offset)) {
    if (scalar === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}

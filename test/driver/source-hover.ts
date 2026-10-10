import { Compiler, LangiumReader, type Inspection } from 'executable-specification-language';
import { onTestFinished, vi, type MockInstance } from 'vitest';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { SourceHover } from '../../src/core/SourceHover.js';
import type { DeclarationHover } from '../../src/core/DeclarationHover.js';
import type { DocumentReport } from '../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';

/** Records actual analysis publications and hover replies without resolving source. */
export class SourceHoverRecording {
  private readonly hoverQueries = new SourceHover();
  private readonly saved = new Map<string, SourceDocument>();
  private readonly inputs = new Map<string, SourceDocument>();
  private readonly reports = new Map<string, DocumentReport>();
  private readonly replies: Array<DeclarationHover | undefined> = [];
  private acquisitions = 0;
  private baseline?: number[];
  private reading?: MockInstance<LangiumReader['read']>;
  private compiling?: MockInstance<Compiler['compile']>;
  private inspectionCalls: MockInstance[] = [];
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => {
      this.inputs.set(source.uri, source);
      this.reports.set(source.uri, report);
      this.hoverQueries.published(source, version, report);
    },
    clear: uri => { this.reports.delete(uri); this.hoverQueries.closed(uri); },
  }, { read: uri => { this.acquisitions++; return this.saved.get(uri); } });

  static create(): SourceHoverRecording {
    const recording = new SourceHoverRecording();
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
  disposed(): void { this.hoverQueries.dispose(); }
  request(uri: string, version: number, line: number, column: number): void {
    const source = this.inputs.get(uri);
    if (!source) throw new Error('No actual input was recorded for ' + uri);
    this.replies.push(this.hoverQueries.hover(uri, version, scalarOffset(source.text, line, column)));
  }
  reply(request: number): DeclarationHover | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual hover reply was recorded for request ' + request);
    return this.replies[request - 1];
  }
  hover(request: number): DeclarationHover {
    const result = this.reply(request);
    if (!result) throw new Error('Request ' + request + ' returned no declaration hover');
    return result;
  }
  name(request: number): string {
    const result = this.hover(request);
    return Array.from(result.source.text).slice(result.startOffset, result.endOffset).join('');
  }
  start(request: number): { line: number; column: number } {
    const result = this.hover(request);
    return scalarPosition(result.source.text, result.startOffset);
  }
  end(request: number): { line: number; column: number } {
    const result = this.hover(request);
    return scalarPosition(result.source.text, result.endOffset);
  }
  hasProblem(uri: string, code: string): boolean {
    const report = this.reports.get(uri);
    if (!report) throw new Error('No actual analysis report was recorded for ' + uri);
    return report.compilation?.problems.some(problem => problem.code === code) ?? false;
  }
  rememberWork(): void {
    this.reading ??= vi.spyOn(LangiumReader.prototype, 'read');
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
    if (!this.baseline) throw new Error('Analysis work was not recorded before hover requests');
    return this.work().every((count, index) => count === this.baseline![index]);
  }
  private work(): number[] {
    return [this.reading?.mock.calls.length ?? 0, this.compiling?.mock.calls.length ?? 0, this.acquisitions,
      ...this.inspectionCalls.map(call => call.mock.calls.length)];
  }
  private cleanup(): void {
    this.reading?.mockRestore(); this.compiling?.mockRestore();
    for (const call of this.inspectionCalls) call.mockRestore();
    this.hoverQueries.dispose();
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
    throw new RangeError('Hover range is outside its actual captured text.');
  let line = 1, column = 1;
  for (const scalar of scalars.slice(0, offset)) {
    if (scalar === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}

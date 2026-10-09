import { Compiler, LangiumReader } from 'executable-specification-language';
import { onTestFinished, vi, type MockInstance } from 'vitest';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../src/core/DocumentReport.js';
import type { SourceDefinition } from '../../src/core/SourceDefinition.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import { SourceNavigation } from '../../src/core/SourceNavigation.js';

/** Records actual analysis publications and navigation replies, without resolving source. */
export class SourceNavigationRecording {
  private readonly navigation = new SourceNavigation();
  private readonly saved = new Map<string, SourceDocument>();
  private readonly inputs = new Map<string, SourceDocument>();
  private readonly reports = new Map<string, DocumentReport>();
  private readonly replies: Array<SourceDefinition | undefined> = [];
  private acquisitions = 0;
  private baseline?: { reads: number; compilations: number; acquisitions: number };
  private reading?: MockInstance<LangiumReader['read']>;
  private compiling?: MockInstance<Compiler['compile']>;
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => {
      this.inputs.set(source.uri, source);
      this.reports.set(source.uri, report);
      this.navigation.published(source, version, report);
    },
    clear: uri => { this.reports.delete(uri); this.navigation.closed(uri); },
  }, { read: uri => { this.acquisitions++; return this.saved.get(uri); } });

  static create(): SourceNavigationRecording {
    const recording = new SourceNavigationRecording();
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
  disposed(): void { this.navigation.dispose(); }
  request(uri: string, version: number, line: number, column: number): void {
    const source = this.inputs.get(uri);
    if (!source) throw new Error('No actual input was recorded for ' + uri);
    this.replies.push(this.navigation.definition(uri, version, scalarOffset(source.text, line, column)));
  }
  reply(request: number): SourceDefinition | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual navigation reply was recorded for request ' + request);
    return this.replies[request - 1];
  }
  definition(request: number): SourceDefinition {
    const result = this.reply(request);
    if (!result) throw new Error('Request ' + request + ' returned no source definition');
    return result;
  }
  name(request: number): string {
    const result = this.definition(request);
    return Array.from(result.source.text).slice(result.startOffset, result.endOffset).join('');
  }
  start(request: number): { line: number; column: number } {
    const result = this.definition(request);
    return scalarPosition(result.source.text, result.startOffset);
  }
  end(request: number): { line: number; column: number } {
    const result = this.definition(request);
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
    this.baseline = this.work();
  }
  workUnchanged(): boolean {
    if (!this.baseline) throw new Error('Analysis work was not recorded before navigation');
    const current = this.work();
    return current.reads === this.baseline.reads && current.compilations === this.baseline.compilations &&
      current.acquisitions === this.baseline.acquisitions;
  }
  private work(): { reads: number; compilations: number; acquisitions: number } {
    return { reads: this.reading?.mock.calls.length ?? 0,
      compilations: this.compiling?.mock.calls.length ?? 0, acquisitions: this.acquisitions };
  }
  private cleanup(): void {
    this.reading?.mockRestore(); this.compiling?.mockRestore(); this.navigation.dispose();
  }
}

function scalarOffset(text: string, line: number, column: number): number {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1)
    throw new RangeError('Source positions must be positive integer lines and columns.');
  const lines = text.split('\n');
  const selected = lines[line - 1];
  if (selected === undefined || column > Array.from(selected).length + 1)
    throw new RangeError('Source position is outside the recorded text.');
  return lines.slice(0, line - 1).reduce((offset, preceding) => offset + Array.from(preceding).length + 1, 0) + column - 1;
}
function scalarPosition(text: string, offset: number): { line: number; column: number } {
  const scalars = Array.from(text);
  if (!Number.isInteger(offset) || offset < 0 || offset > scalars.length)
    throw new RangeError('Definition range is outside its actual captured text.');
  let line = 1, column = 1;
  for (const scalar of scalars.slice(0, offset)) {
    if (scalar === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}
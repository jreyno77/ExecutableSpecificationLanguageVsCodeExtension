import { Compiler, LangiumReader, type Inspection } from 'executable-specification-language';
import { onTestFinished, vi, type MockInstance } from 'vitest';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { DocumentOutline } from '../../src/core/DocumentOutline.js';
import type { DocumentReport } from '../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import type { SourceOutline } from '../../src/core/SourceOutline.js';
import type { SourceOutlineSymbol } from '../../src/core/SourceOutlineSymbol.js';

/** Records real analysis publications and the outline caller's actual replies. */
export class DocumentOutlineRecording {
  private readonly outlines = new DocumentOutline();
  private readonly saved = new Map<string, SourceDocument>();
  private readonly reports = new Map<string, DocumentReport>();
  private readonly replies: Array<SourceOutline | undefined> = [];
  private acquisitions = 0;
  private baseline?: number[];
  private reading?: MockInstance<LangiumReader['read']>;
  private compiling?: MockInstance<Compiler['compile']>;
  private inspectionCalls: MockInstance[] = [];
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => {
      this.reports.set(source.uri, report);
      this.outlines.published(source, version, report);
    },
    clear: uri => { this.reports.delete(uri); this.outlines.closed(uri); },
  }, { read: uri => { this.acquisitions++; return this.saved.get(uri); } });

  static create(): DocumentOutlineRecording {
    const recording = new DocumentOutlineRecording();
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
  disposed(): void { this.outlines.dispose(); }
  request(uri: string, version: number): void { this.replies.push(this.outlines.symbols(uri, version)); }
  reply(request: number): SourceOutline | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual outline request was recorded for ' + request);
    return this.replies[request - 1];
  }
  outline(request: number): SourceOutline {
    const reply = this.reply(request);
    if (!reply) throw new Error('Request ' + request + ' returned no document outline');
    return reply;
  }
  symbol(request: number, path: number[]): SourceOutlineSymbol {
    if (!path.length || path.some(index => !Number.isInteger(index) || index < 1))
      throw new RangeError('Outline paths contain positive one-based sibling positions.');
    let siblings = this.outline(request).symbols, symbol: SourceOutlineSymbol | undefined;
    for (const index of path) {
      symbol = siblings[index - 1];
      if (!symbol) throw new Error('The actual outline has no declaration at ' + path.join('/'));
      siblings = symbol.children;
    }
    return symbol!;
  }
  declarationCount(request: number): number {
    const count = (symbols: SourceOutlineSymbol[]): number => symbols.reduce((total, symbol) => total + 1 + count(symbol.children), 0);
    return count(this.outline(request).symbols);
  }
  position(request: number, offset: number): { line: number; column: number } {
    const scalars = Array.from(this.outline(request).source.text);
    if (!Number.isInteger(offset) || offset < 0 || offset > scalars.length)
      throw new RangeError('Outline range is outside its actual captured text.');
    let line = 1, column = 1;
    for (const scalar of scalars.slice(0, offset)) {
      if (scalar === '\n') { line++; column = 1; } else column++;
    }
    return { line, column };
  }
  attemptMutation(request: number): void {
    const reply = this.outline(request);
    const root = this.symbol(request, [1]);
    this.symbol(request, [1, 1]);
    const attempt = (change: () => void): void => { try { change(); } catch (error) { if (!(error instanceof TypeError)) throw error; } };
    attempt(() => { reply.source.text = 'caller changed source'; });
    attempt(() => { root.name = 'caller changed declaration'; });
    attempt(() => { root.children.length = 0; });
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
    if (!this.baseline) throw new Error('Analysis work was not recorded before outline requests');
    return this.work().every((count, index) => count === this.baseline![index]);
  }
  private work(): number[] {
    return [this.reading?.mock.calls.length ?? 0, this.compiling?.mock.calls.length ?? 0, this.acquisitions,
      ...this.inspectionCalls.map(call => call.mock.calls.length)];
  }
  private cleanup(): void {
    this.reading?.mockRestore(); this.compiling?.mockRestore();
    for (const call of this.inspectionCalls) call.mockRestore();
    this.outlines.dispose();
  }
}

import * as language from 'executable-specification-language';
import { onTestFinished, vi, type MockInstance } from 'vitest';

vi.mock('executable-specification-language', async importOriginal => {
  const actual = await importOriginal<typeof import('executable-specification-language')>();
  return { ...actual, typeCandidates: vi.fn(actual.typeCandidates) };
});
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import { SourceCompletion } from '../../src/core/SourceCompletion.js';

import type { SourceDocument } from '../../src/core/SourceDocument.js';
import type { TypeCompletion } from '../../src/core/TypeCompletion.js';
import type { TypeSuggestion } from '../../src/core/TypeSuggestion.js';

/** Owns real source publications and retains every actual completion reply. */
export class SourceCompletionRecording {
  private readonly completion = new SourceCompletion();
  private readonly saved = new Map<string, SourceDocument>();
  private readonly inputs = new Map<string, SourceDocument>();
  private readonly replies: Array<TypeCompletion | undefined> = [];
  private readonly observations: MockInstance[] = [];
  private acquisitions = 0;
  private baseline?: number[];
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => {
      this.inputs.set(source.uri, source);
      this.completion.published(source, version, report);
    },
    clear: uri => this.completion.closed(uri),
  }, { read: uri => { this.acquisitions++; return this.saved.get(uri); } });

  static create(): SourceCompletionRecording {
    const recording = new SourceCompletionRecording();
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
  request(uri: string, version: number, line: number, column: number): void {
    const source = this.inputs.get(uri);
    if (!source) throw new Error('No actual completion input was recorded for ' + uri);
    this.replies.push(this.completion.completion(uri, version, scalarOffset(source.text, line, column)));
  }
  reply(request: number): TypeCompletion | undefined {
    if (!Number.isInteger(request) || request < 1 || request > this.replies.length)
      throw new Error('No actual completion reply was recorded for request ' + request);
    return this.replies[request - 1];
  }
  completed(request: number): TypeCompletion {
    const actual = this.reply(request);
    if (!actual) throw new Error('Request ' + request + ' returned no completion');
    return actual;
  }
  suggestion(request: number, index: number): TypeSuggestion {
    if (!Number.isInteger(index) || index < 1) throw new RangeError('Suggestion indexes are positive integers.');
    const actual = this.completed(request).suggestions[index - 1];
    if (!actual) throw new Error('The actual completion has no suggestion ' + index);
    return actual;
  }
  start(request: number): { line: number; column: number } {
    const actual = this.completed(request);
    return scalarPosition(actual.source.text, actual.startOffset);
  }
  end(request: number): { line: number; column: number } {
    const actual = this.completed(request);
    return scalarPosition(actual.source.text, actual.endOffset);
  }
  rememberWork(): void {
    if (!this.observations.length) {
      this.observations.push(vi.spyOn(language.LangiumReader.prototype, 'read'),
        vi.spyOn(language.SourceComposer.prototype, 'compose'),
        vi.spyOn(language.Compiler.prototype, 'compile'));
      for (const method of ['query', 'read', 'children', 'parent', 'roots'] as const)
        this.observations.push(vi.spyOn(language.QueryInspection.prototype, method));
    }
    this.baseline = this.work();
  }
  workUnchanged(): boolean {
    if (!this.baseline) throw new Error('Actual completion work was not remembered before the requests.');
    return this.work().every((count, index) => count === this.baseline![index]);
  }
  private work(): number[] { return [this.acquisitions, vi.mocked(language.typeCandidates).mock.calls.length,
      ...this.observations.map(observation => observation.mock.calls.length)]; }
  private cleanup(): void {
    for (const observation of this.observations) observation.mockRestore();
    this.completion.dispose();
  }
}
function scalarOffset(text: string, line: number, column: number): number {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1)
    throw new RangeError('Source positions are positive integer lines and columns.');
  const lines = text.split('\n'), selected = lines[line - 1];
  if (selected === undefined || column > Array.from(selected).length + 1)
    throw new RangeError('The completion position is outside its actual input.');
  return lines.slice(0, line - 1).reduce((offset, preceding) => offset + Array.from(preceding).length + 1, 0) + column - 1;
}
function scalarPosition(text: string, offset: number): { line: number; column: number } {
  const scalars = Array.from(text);
  if (!Number.isInteger(offset) || offset < 0 || offset > scalars.length)
    throw new RangeError('The completion range is outside its captured text.');
  let line = 1, column = 1;
  for (const scalar of scalars.slice(0, offset)) {
    if (scalar === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}

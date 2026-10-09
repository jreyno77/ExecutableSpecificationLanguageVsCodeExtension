import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import type { SyntaxDiagnostic, Compilation, Diagnostic } from 'executable-specification-language';
import type { DocumentReport } from '../../src/core/DocumentReport.js';

type Publication = { source: SourceDocument; version: number; problems: SyntaxDiagnostic[]; report: DocumentReport };

/** Observes the real core's feedback without parsing or classifying source text. */
export class DocumentAnalysisRecording {
  private readonly publications: Publication[] = [];
  private readonly clears: string[] = [];
  private invalidVersion = false;
  private readonly savedSources = new Map<string, SourceDocument>();
  private readonly analysis = new DocumentAnalysis({
    publish: (source, version, report) => { this.publications.push({ source, version, report, problems: report.syntax }); },
    clear: uri => { this.clears.push(uri); },
  }, { read: uri => this.savedSources.get(uri) });

  saved(source: SourceDocument): void {
    this.savedSources.set(source.uri, { uri: source.uri, text: source.text });
    this.analysis.sourceChanged(source.uri);
  }
  removed(uri: string): void { this.savedSources.delete(uri); this.analysis.sourceChanged(uri); }
  compilation(uri: string): Compilation | undefined { return this.latest(uri).report.compilation; }
  semanticProblem(uri: string): Diagnostic {
    const problem = this.compilation(uri)?.problems[0];
    if (!problem) throw new Error('No semantic problem was published for ' + uri);
    return problem;
  }

  opened(source: SourceDocument, version: number): void { this.analysis.opened(source, version); }
  changed(source: SourceDocument, version: number): void { this.analysis.changed(source, version); }
  closed(uri: string): void { this.analysis.closed(uri); }
  tryOpened(source: SourceDocument, version: number): void { this.tryVersion(() => this.analysis.opened(source, version)); }
  tryChanged(source: SourceDocument, version: number): void { this.tryVersion(() => this.analysis.changed(source, version)); }
  invalidVersionRejected(): boolean { return this.invalidVersion; }
  publicationCount(uri: string): number { return this.publications.filter(packet => packet.source.uri === uri).length; }
  clearCount(uri: string): number { return this.clears.filter(cleared => cleared === uri).length; }
  latest(uri: string): Publication {
    const packet = this.publications.filter(publication => publication.source.uri === uri).at(-1);
    if (!packet) throw new Error('No feedback was published for ' + uri);
    return packet;
  }
  problem(uri: string): SyntaxDiagnostic {
    const problem = this.latest(uri).problems[0];
    if (!problem) throw new Error('No syntax problem was published for ' + uri);
    return problem;
  }
  private tryVersion(action: () => void): void {
    this.invalidVersion = false;
    try { action(); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.invalidVersion = true;
    }
  }
}

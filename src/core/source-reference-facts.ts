import type { Item, Origin, SourceRange } from 'executable-specification-language';
import type { DocumentReport } from './DocumentReport.js';
import type { SourceDocument } from './SourceDocument.js';

export type CapturedSource = { source: SourceDocument; scalars: readonly string[] };
type BoundReference = { range: SourceRange; target: Item };
type SourceReferenceFacts = {
  sources: ReadonlyMap<string, CapturedSource>;
  references: readonly BoundReference[];
};
const prepared = new WeakMap<DocumentReport, SourceReferenceFacts>();

/** Navigation and hover share the exact publication's captured, bound reference facts. */
export function sourceReferenceFacts(report: DocumentReport): SourceReferenceFacts {
  const previous = prepared.get(report);
  if (previous) return previous;
  const sources = new Map(report.sources.map(source => [source.uri, {
    source: Object.freeze({ uri: source.uri, text: source.text }),
    scalars: Object.freeze(Array.from(source.text)),
  }]));
  const references: BoundReference[] = [];
  if (report.inspection) {
    for (const reference of report.inspection.query('reference')) {
      const origin = reference.segmentOrigins.at(-1);
      if (origin?.kind !== 'source' || reference.resolution.status !== 'bound') continue;
      const captured = sources.get(origin.range.sourceId);
      if (!captured || !validSourceRange(origin.range, captured.scalars.length)) continue;
      references.push({ range: origin.range, target: report.inspection.read(reference.resolution.target) });
    }
  }
  const facts = { sources, references };
  prepared.set(report, facts);
  return facts;
}

export function capturedOrigin(origin: Origin, sources: ReadonlyMap<string, CapturedSource>): CapturedSource | undefined {
  if (origin.kind !== 'source') return undefined;
  const source = sources.get(origin.range.sourceId);
  return source && validSourceRange(origin.range, source.scalars.length) ? source : undefined;
}
export function validSourceRange(range: SourceRange, length: number): boolean {
  return Number.isInteger(range.start.offset) && Number.isInteger(range.end.offset) &&
    range.start.offset >= 0 && range.end.offset > range.start.offset && range.end.offset <= length;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OutputTab } from '../core/OutputTab.js';
import type { OutputDocument } from '../core/OutputDocument.js';
import './output-tabs.css';

type Selection = { output: string | undefined; paths: Map<string, string> };
function currentSelection(tabs: OutputTab[], previous: Selection): Selection {
  const output = tabs.some(tab => tab.id === previous.output) ? previous.output : tabs[0]?.id;
  const paths = new Map<string, string>();
  for (const tab of tabs) {
    const documents = tab.status === 'ready' ? tab.documents ?? [] : [];
    const path = documents.find(document => document.path === previous.paths.get(tab.id))?.path ?? documents[0]?.path;
    if (path !== undefined) paths.set(tab.id, path);
  }
  return { output, paths };
}
function sameSelection(left: Selection, right: Selection): boolean {
  return left.output === right.output && left.paths.size === right.paths.size
    && [...left.paths].every(([id, path]) => right.paths.get(id) === path);
}

export function OutputTabsView({ tabs }: { tabs: OutputTab[] }) {
  const [selection, select] = useState<Selection>({ output: undefined, paths: new Map() });
  const current = currentSelection(tabs, selection);
  if (!sameSelection(selection, current)) select(current);
  const selected = tabs.find(tab => tab.id === current.output);
  const documents = selected?.status === 'ready' ? selected.documents ?? [] : [];
  const document = documents.find(document => document.path === current.paths.get(selected!.id));
  const explanation = selected?.status !== 'ready' ? selected?.message ?? selected?.status ?? 'Pending preview.'
    : documents.length ? selected.message : selected.message ?? 'No authored documents';
  return <section className="expec-output-tabs">
    <div className="expec-output-buttons" role="tablist" aria-label="Configured outputs">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" data-output-id={tab.id}
        aria-selected={tab.id === current.output} onClick={() => select({ ...current, output: tab.id })}>{tab.label}</button>)}
    </div>
    {selected && <section role="tabpanel" aria-label={selected.label} data-output-id={selected.id}
      data-status={selected.status ?? 'pending'} data-document-path={document?.path} data-media-type={document?.mediaType}>
      {explanation && <p data-output-explanation>{explanation}</p>}
      {!!documents.length && <div className="expec-document-buttons" aria-label="Output documents">
        {documents.map(document => <button key={document.path} type="button" data-document-path={document.path}
          aria-pressed={document.path === current.paths.get(selected.id)} onClick={() => {
            const paths = new Map(current.paths); paths.set(selected.id, document.path); select({ ...current, paths });
          }}>{document.path}</button>)}
      </div>}
      {document && <DocumentView key={selected.id + '\0' + document.path + '\0' + document.content} document={document} />}
    </section>}
  </section>;
}

function DocumentView({ document }: { document: OutputDocument }) {
  const media = document.mediaType.split(';', 1)[0]!.trim().toLowerCase();
  if (media === 'image/svg+xml') return <DiagramImage document={document} />;
  if (media.startsWith('text/') || media === 'application/json' || media.endsWith('+json')) {
    return <pre data-output-content>{document.content}</pre>;
  }
  return <p data-output-explanation>Cannot display {document.path}: unsupported media type {document.mediaType}.</p>;
}
function svgSource(content: string): string {
  const bytes = new TextEncoder().encode(content); let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return 'data:image/svg+xml;base64,' + btoa(binary);
}
function svgSize(content: string, natural: { width: number; height: number }): { width: number; height: number } {
  const svg = new DOMParser().parseFromString(content, 'image/svg+xml').documentElement;
  if (!(svg instanceof SVGSVGElement) || svg.hasAttribute('width') || svg.hasAttribute('height')) return natural;
  const { x, y, width, height } = svg.viewBox.baseVal;
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? { width, height } : natural;
}
function DiagramImage({ document }: { document: OutputDocument }) {
  const image = useRef<HTMLImageElement>(null), source = useMemo(() => svgSource(document.content), [document.content]);
  const [percent, zoom] = useState(100), [size, measure] = useState<{ width: number; height: number }>(), [failed, fail] = useState(false);
  useEffect(() => {
    const node = image.current!;
    const loaded = () => {
      if (image.current !== node) return;
      fail(node.naturalWidth === 0);
      if (node.naturalWidth) measure(svgSize(document.content, { width: node.naturalWidth, height: node.naturalHeight }));
    };
    const error = () => { if (image.current === node) fail(true); };
    node.addEventListener('load', loaded); node.addEventListener('error', error);
    if (node.complete) loaded();
    return () => {
      node.removeEventListener('load', loaded); node.removeEventListener('error', error);
      node.removeAttribute('src');
    };
  }, [source]);
  return <div className="expec-diagram">
    <div className="expec-diagram-controls">
      <label>Diagram zoom (%) <input type="number" min="1" step="25" value={percent} onChange={event => {
        const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value) && value > 0) zoom(value);
      }} /></label>
      <button type="button" onClick={() => zoom(100)}>Reset zoom</button>
    </div>
    <p data-output-explanation>{failed ? 'Cannot display SVG image: ' + document.path + '.' : ''}</p>
    <div className="expec-diagram-viewport" data-diagram-viewport>
      <img ref={image} data-diagram-image src={source} alt={document.path}
        width={size && size.width * percent / 100} height={size && size.height * percent / 100} />
    </div>
  </div>;
}

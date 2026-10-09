import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { onTestFinished } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { svgBrowser, svgTextLabels } from './svg-labels.js';
import { acceptanceOutput, contractListOutput, javaAcceptanceOutput, javaOutput, kotlinAcceptanceOutput, kotlinOutput,
  markdownOutput, pythonAcceptanceOutput, pythonOutput, structureListOutput, typescriptOutput, umlOutput,
  type OutputRegistration } from 'executable-specification-language';
import { OutputPreviews } from '../../src/core/OutputPreviews.js';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import type { PreviewPublication } from '../../src/core/PreviewPublication.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import type { OutputTab } from '../../src/core/OutputTab.js';

const shipped = [typescriptOutput, markdownOutput, umlOutput, contractListOutput, structureListOutput,
  acceptanceOutput, javaOutput, javaAcceptanceOutput, kotlinOutput, kotlinAcceptanceOutput, pythonOutput, pythonAcceptanceOutput];
function signal(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve };
}
type Gate = { entered: ReturnType<typeof signal>; released: ReturnType<typeof signal> };
type Work = { count: number; active: number; maximum: number };

/** Real analysis and registered renderer replies; records only core feedback and owned callback work. */
export class OutputPreviewsRecording {
  private root = '';
  private initialTree = '';
  private readonly publications: PreviewPublication[] = [];
  private readonly saved = new Map<string, SourceDocument>();
  private readonly work = new Map<string, Work>();
  private readonly armed = new Map<string, Gate>();
  private readonly held = new Map<string, Gate>();
  private readonly running = new Set<Promise<unknown>>();
  private readonly changed = new Set<() => void>();
  private readonly remembered = new Map<string, OutputTab>();
  private previews: OutputPreviews | undefined;
  private analysis!: DocumentAnalysis;
  private disposalIndex: number | undefined;
  private context: BrowserContext | undefined;
  private contextClosed = false;
  private page: Page | undefined;

  static async create(configuration: string, heldId?: string, binary?: 'text' | 'binary'): Promise<OutputPreviewsRecording> {
    const recording = new OutputPreviewsRecording(); onTestFinished(() => recording.dispose());
    await recording.initialize(configuration, heldId, binary); return recording;
  }
  static async withRegistrations(configuration: string, registrations: readonly OutputRegistration[], heldId?: string): Promise<OutputPreviewsRecording> {
    const recording = new OutputPreviewsRecording(); onTestFinished(() => recording.dispose());
    await recording.initialize(configuration, heldId, undefined, registrations); return recording;
  }
  private async initialize(configuration: string, heldId?: string, binary?: 'text' | 'binary', supplied?: readonly OutputRegistration[]): Promise<void> {
    this.root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'expec-output-previews-')));
    await fs.mkdir(join(this.root, 'target', 'src'), { recursive: true });
    await fs.writeFile(join(this.root, 'target', 'src', 'handwritten.ts'), 'export const keep = 7;\n');
    await fs.writeFile(join(this.root, 'expec.json'), configuration);
    this.initialTree = await this.tree();
    if (heldId) this.arm(heldId);
    const registrations = supplied ?? (binary ? [this.binary(binary)] : shipped);
    this.previews = new OutputPreviews({ present: publication => {
      this.publications.push(structuredClone(publication)); for (const notify of [...this.changed]) notify();
    } }, registrations.map(registration => this.decorate(registration)));
    this.analysis = new DocumentAnalysis({ publish: (source, version, report) => this.previews!.published(source, version, report),
      clear: uri => this.previews!.closed(uri) }, { read: uri => this.saved.get(uri) });
    this.configure(configuration);
  }
  private binary(kind: 'text' | 'binary'): OutputRegistration {
    return { id: kind === 'text' ? 'typescript' : 'binary', validate: () => [], open: () => { throw Error('Preview must never open an adapter.'); },
      preview: async () => ({ value: [{ path: 'draft/value', mediaType: kind === 'text' ? 'text/typescript' : 'application/octet-stream',
        bytes: kind === 'text' ? new Uint8Array([255]) : new Uint8Array([0, 255]) }], problems: [], deferred: [] }) };
  }
  private decorate(registration: OutputRegistration): OutputRegistration {
    const preview = registration.preview;
    return { ...registration, open: (...args) => { throw Error('Preview must not open project output ' + registration.id + '.'); },
      ...(preview ? { preview: (...args: Parameters<NonNullable<OutputRegistration['preview']>>) => {
        const row = this.work.get(registration.id) ?? { count: 0, active: 0, maximum: 0 }; this.work.set(registration.id, row);
        row.count++; row.active++; row.maximum = Math.max(row.maximum, row.active);
        const gate = this.armed.get(registration.id); this.armed.delete(registration.id);
        const call = (async () => {
          if (gate) { this.held.set(registration.id, gate); gate.entered.resolve(); await gate.released.promise; }
          return preview.call(registration, ...args);
        })().finally(() => { row.active--; this.running.delete(call); });
        this.running.add(call); return call;
      } } : {}) };
  }
  configure(text: string): void { this.previews!.configurationChanged({ file: join(this.root, 'expec.json'), text, writable: true }); }
  opened(source: SourceDocument, version: number): void { this.previews!.selected(source.uri); this.analysis.opened(source, version); }
  edited(source: SourceDocument, version: number): void { this.analysis.changed(source, version); }
  savedImport(uri: string, text: string): void { this.saved.set(uri, { uri, text }); this.analysis.sourceChanged(uri); }
  closed(uri: string): void { this.analysis.closed(uri); }
  disposed(): void { this.disposalIndex = this.publications.length; this.previews!.dispose(); }
  arm(id: string): void {
    if (this.armed.has(id)) throw Error('That output already has an armed invocation.');
    this.armed.set(id, { entered: signal(), released: signal() });
  }
  async awaitHeld(id: string): Promise<void> {
    const gate = this.armed.get(id) ?? this.held.get(id); if (!gate) throw Error('No real callback was gated for ' + id + '.');
    await gate.entered.promise;
  }
  release(id: string): void { const gate = this.held.get(id); if (!gate) throw Error('No running callback is held for ' + id + '.'); gate.released.resolve(); }
  async settle(): Promise<void> { await this.wait(() => this.current.tabs.every(tab => tab.status !== 'pending')); }
  async ready(id: string): Promise<void> { await this.wait(() => this.current.tabs.some(tab => tab.id === id && tab.status === 'ready')); }
  private async wait(predicate: () => boolean): Promise<void> {
    if (predicate()) return;
    await new Promise<void>(resolve => { const changed = () => { if (predicate()) { this.changed.delete(changed); resolve(); } }; this.changed.add(changed); });
  }
  async drain(): Promise<void> {
    do { await Promise.allSettled([...this.running]); await Promise.resolve(); } while (this.running.size);
  }
  remember(id: string): void { this.remembered.set(id, structuredClone(this.tab(id))); }
  earlier(id: string): OutputTab { const tab = this.remembered.get(id); if (!tab) throw Error('No actual tab was remembered.'); return tab; }
  get current(): PreviewPublication { const current = this.publications.at(-1); if (!current) throw Error('No preview feedback was published.'); return current; }
  tab(id: string): OutputTab { const tab = this.current.tabs.find(tab => tab.id === id); if (!tab) throw Error('No tab for ' + id + '.'); return tab; }
  document(id: string, path: string, earlier = false) {
    const document = (earlier ? this.earlier(id) : this.tab(id)).documents?.find(document => document.path === path);
    if (!document) throw Error('No actual document ' + path + ' in output ' + id + '.'); return document;
  }
  count(id: string): number { return this.work.get(id)?.count ?? 0; }
  maximum(id: string): number { return this.work.get(id)?.maximum ?? 0; }
  afterDisposal(): number { if (this.disposalIndex === undefined) throw Error('Preview has not been disposed.'); return this.publications.length - this.disposalIndex; }
  async preserved(): Promise<boolean> { return await this.tree() === this.initialTree; }
  async svgHasLabel(id: string, path: string, label: string): Promise<boolean> {
    const document = this.document(id, path); if (document.mediaType !== 'image/svg+xml') throw Error('That actual document is not SVG.');
    if (!this.context) { this.context = await (await svgBrowser()).newContext(); this.context.on('close', () => { this.contextClosed = true; }); await this.context.route('**/*', route => route.abort()); this.page = await this.context.newPage(); }
    return (await svgTextLabels(this.page!, document.content)).some(actual => actual.trim() === label);
  }
  async releasedResources(): Promise<{ context: boolean; fixture: boolean }> {
    let fixture = false;
    try { await fs.lstat(this.root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; fixture = true; }
    return { context: this.context === undefined || this.contextClosed, fixture };
  }
  private async tree(): Promise<string> {
    const rows: { path: string; kind: string; bytes?: string }[] = [];
    const visit = async (path: string): Promise<void> => {
      const absolute = path ? join(this.root, ...path.split('/')) : this.root, info = await fs.lstat(absolute);
      if (info.isSymbolicLink()) { rows.push({ path, kind: 'link', bytes: await fs.readlink(absolute) }); return; }
      if (info.isDirectory()) { rows.push({ path, kind: 'directory' }); for (const name of (await fs.readdir(absolute)).sort()) await visit(path ? path + '/' + name : name); }
      else rows.push({ path, kind: 'file', bytes: (await fs.readFile(absolute)).toString('base64') });
    }; await visit(''); return JSON.stringify(rows);
  }
  async dispose(): Promise<void> {
    const failures: unknown[] = [];
    const attempt = async (release: () => void | Promise<void>) => {
      try { await release(); } catch (error) { failures.push(error); }
    };
    for (const gate of [...this.armed.values(), ...this.held.values()]) gate.released.resolve();
    await attempt(() => this.previews?.dispose());
    await attempt(() => this.drain());
    await attempt(() => this.context?.close());
    await attempt(async () => {
      if (this.root) {
        if (dirname(this.root) !== await fs.realpath(tmpdir()) || !basename(this.root).startsWith('expec-output-previews-')) throw Error('Unsafe preview fixture cleanup.');
        await fs.rm(this.root, { recursive: true, force: true });
      }
    });
    if (failures.length) throw new AggregateError(failures, 'Preview recording cleanup failed.');
  }
}

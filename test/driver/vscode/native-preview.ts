import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Frame } from 'playwright';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';
import { VsCodeSession, type PreviewEditorObservation } from './vscode-session.js';

type RenderedPreview = { uri: string; version: number; ids: string[]; selectedId: string; status: string; path: string; mediaType: string;
  text: string; explanation: string; paths: string[]; imageDecoded: boolean; svgLabels: string; zoom: number; imageWidth: number;
  naturalWidth: number; imageHeight: number; imageWidthAttribute: string | null; imageHeightAttribute: string | null; viewportWidth: number; viewportHeight: number; scrollWidth: number; scrollHeight: number; left: number; top: number };

/** A mutable native editor case; every presentation observation comes from the installed product DOM. */
export class NativePreviewCase {
  private readonly id = randomUUID();
  private directory: string | undefined;
  private session: VsCodeSession | undefined;
  private editor: PreviewEditorObservation | undefined;
  private frame: Frame | undefined;
  private opening: Promise<void> | undefined;
  private disposal: Promise<void> | undefined;
  private beforeFiles: string | undefined;
  private readonly visited = new Map<string, RenderedPreview>();
  private beforeEdit = '';
  private beforeConfiguration: string[] = [];
  private closedText = '';
  private readonly zooms: number[] = [];
  private overflowObserved = false;
  private scrolledObserved = false;
  private initialDiagramWidth: number | undefined;
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly initialText: string, private readonly configuration: string, private readonly workspace: string) {}

  open(): Promise<void> { return this.opening ??= this.openOwnedEditor(); }
  private async openOwnedEditor(): Promise<void> {
    this.directory = await ownTemporaryDirectory('expec-preview-editor-', this.workspace);
    await mkdir(join(this.directory, 'src'));
    await writeFile(join(this.directory, 'src/library.expec'), this.initialText);
    await writeFile(join(this.directory, 'expec.json'), this.configuration);
    for (const [path, text] of [['draft/types/Book.ts', '// manual TypeScript remains\n'], ['draft/docs/Book.md', '# Manual Markdown remains\n'],
      ['draft/uml/structure.d2', 'manual: preserved\n'], ['draft/uml/structure.svg', '<svg xmlns="http://www.w3.org/2000/svg"><text>Manual</text></svg>']]) {
      await mkdir(join(this.directory, path.slice(0, path.lastIndexOf('/'))), { recursive: true });
      await writeFile(join(this.directory, path), text);
    }
    this.beforeFiles = await ownedTree(this.directory);
    this.session = await this.getSession();
    this.editor = await this.session.openPreviewEditor(this.id, this.extensionId,
      { file: join(this.directory, 'src/library.expec'), configurationFile: join(this.directory, 'expec.json'), resetFile: join(this.workspace, 'expec.json') });
  }
  async show(): Promise<void> {
    await this.open();
    // Attach before creating the cross-process webview so Playwright observes its frame events.
    await this.session!.webviewBrowser();
    this.editor = await this.session!.showPreviewEditor(this.id);
    this.frame = undefined;
    await this.settled();
  }
  async edit(text: string): Promise<void> {
    await this.open();
    if (this.frame && !this.frame.isDetached()) this.beforeEdit = (await this.settled()).status;
    this.visited.clear();
    this.editor = await this.session!.editPreviewEditor(this.id, text);
    if (this.frame && !this.frame.isDetached()) await this.settled();
  }
  async saveConfiguration(text: string): Promise<void> {
    this.beforeConfiguration = (await this.settled()).ids;
    this.visited.clear();
    this.editor = await this.session!.savePreviewConfiguration(this.id, text);
    // Output observations wait on the actual new product DOM; no local parsing predicts the tabs.
  }
  async selectOutput(id: string): Promise<void> {
    const frame = await this.productFrame();
    const selector = await frame.evaluate(id => `[role="tab"][data-output-id="${CSS.escape(id)}"]`, id);
    await frame.locator(selector).click({ timeout: 30_000 });
    await this.settled(value => value.selectedId === id);
  }
  async selectDocument(path: string): Promise<void> {
    const frame = await this.productFrame();
    const selector = await frame.evaluate(path => `button[data-document-path="${CSS.escape(path)}"]`, path);
    await frame.locator(selector).click({ timeout: 30_000 });
    const actual = await this.settled(value => value.path === path && (value.mediaType !== 'image/svg+xml' || value.imageDecoded));
    this.visited.set(key(actual.selectedId, actual.path), actual);
    if (actual.mediaType === 'image/svg+xml' && this.zooms.length === 0) this.zooms.push(actual.zoom);
  }
  async closePanel(): Promise<void> {
    this.closedText = (await this.settled()).text;
    this.editor = await this.session!.closePreviewPanel(this.id); this.frame = undefined;
  }
  async zoomDiagram(): Promise<void> {
    const before = await this.settled(), frame = await this.productFrame();
    if (before.zoom !== 100) throw new Error('Observe the actual diagram at 100% before zooming.');
    this.initialDiagramWidth = before.imageWidth;
    await frame.getByLabel('Diagram zoom (%)', { exact: true }).fill('125');
    const actual = await this.settled(value => value.zoom === 125 && value.imageWidth > before.imageWidth);
    this.zooms.push(actual.zoom);
  }
  async scrollDiagram(): Promise<void> {
    const before = await this.settled(), frame = await this.productFrame();
    this.overflowObserved = before.scrollWidth > before.viewportWidth || before.scrollHeight > before.viewportHeight;
    if (!this.overflowObserved) console.info('Actual native diagram geometry:', JSON.stringify(await frame.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>('[data-diagram-viewport]')!, image = document.querySelector<HTMLImageElement>('img[data-diagram-image]')!;
      const style = getComputedStyle(viewport);
      const svgBytes = Uint8Array.from(atob(image.src.slice(image.src.indexOf(',') + 1)), character => character.charCodeAt(0));
      const svg = new DOMParser().parseFromString(new TextDecoder('utf-8', { fatal: true }).decode(svgBytes), 'image/svg+xml').documentElement;
      return { svgAttributes: Array.from(svg.attributes).map(attribute => [attribute.name, attribute.value]), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, imageWidth: image.getBoundingClientRect().width, imageHeight: image.getBoundingClientRect().height,
        viewportWidth: viewport.clientWidth, viewportHeight: viewport.clientHeight, scrollWidth: viewport.scrollWidth, scrollHeight: viewport.scrollHeight,
        overflow: style.overflow, cssWidth: style.width, cssHeight: style.height, viewportClass: viewport.className, windowWidth: innerWidth, windowHeight: innerHeight,
        styles: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => ({ href: link.href, loaded: !!link.sheet })),
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') };
    })));
    await frame.locator('[data-diagram-viewport]').evaluate(node => node.scrollTo({ left: 80, top: 60 }));
    const actual = await this.settled();
    this.scrolledObserved = actual.left > 0 || actual.top > 0;
  }
  async resetZoom(): Promise<void> {
    const frame = await this.productFrame(), initialWidth = this.initialDiagramWidth;
    if (initialWidth === undefined) throw new Error('No actual initial 100% diagram width was recorded.');
    await frame.getByRole('button', { name: 'Reset zoom', exact: true }).click();
    const actual = await this.settled(value => value.zoom === 100 && Math.abs(value.imageWidth - initialWidth) < 1);
    this.zooms.push(actual.zoom);
  }
  async outputIds(): Promise<string[]> { return (await this.settled()).ids; }
  selectedId(id: string, path: string): string { return this.observed(id, path).selectedId; }
  documentPath(id: string, path: string): string { return this.observed(id, path).path; }
  documentMediaType(id: string, path: string): string { return this.observed(id, path).mediaType; }
  textIncludes(id: string, path: string, text: string): boolean { return this.observed(id, path).text.includes(text); }
  observedStatus(id: string, path: string): string { return this.observed(id, path).status; }
  beforeEditStatus(): string { return this.beforeEdit; }
  beforeConfigurationIds(): string[] { return [...this.beforeConfiguration]; }
  closedTextIncludes(text: string): boolean { return this.closedText.includes(text); }
  zoomHistory(): number[] { return [...this.zooms]; }
  async documentCount(): Promise<number> { return (await this.settled()).paths.length; }
  async status(): Promise<string> { return (await this.settled()).status; }
  async explanation(): Promise<string> { return (await this.settled()).explanation; }
  imageDecoded(id: string, path: string): boolean { return this.observed(id, path).imageDecoded; }
  svgContainsLabel(id: string, path: string, text: string): boolean { return this.observed(id, path).svgLabels.includes(text); }
  async zoomPercent(): Promise<number> { return (await this.settled()).zoom; }
  diagramOverflow(): boolean { return this.overflowObserved; }
  diagramScrolled(): boolean { return this.scrolledObserved; }
  async savedText(): Promise<string> { return (await this.nativeObservation()).savedText; }
  async openText(): Promise<string> { return (await this.nativeObservation()).text; }
  async sourceDirty(): Promise<boolean> { return (await this.nativeObservation()).dirty; }
  async filesUnchanged(): Promise<boolean> { return this.beforeFiles === await ownedTree(this.directory!); }
  private observed(id: string, path: string): RenderedPreview {
    const value = this.visited.get(key(id, path));
    if (!value || value.uri !== this.editor?.uri || value.version !== this.editor.version) throw new Error('No current actually visited preview document: ' + id + '/' + path);
    return value;
  }
  private async nativeObservation(): Promise<PreviewEditorObservation> {
    await this.open(); return this.editor = await this.session!.observePreviewEditor(this.id);
  }
  private async productFrame(): Promise<Frame> {
    if (this.frame && !this.frame.isDetached()) return this.frame;
    const browser = await this.session!.webviewBrowser(), deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const found: Frame[] = [];
      for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
        if (await frame.locator('body[data-expec-output-previews]').count().catch(() => 0)) found.push(frame);
      }
      if (found.length > 1) throw new Error('More than one product preview frame is open in the owned native host.');
      if (found.length === 1) return this.frame = found[0];
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const frames = [];
    for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
      frames.push(await frame.evaluate(() => ({ url: location.href, title: document.title,
        bodyAttributes: document.body ? Array.from(document.body.attributes).map(attribute => [attribute.name, attribute.value]) : [],
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
        scripts: Array.from(document.scripts).map(script => script.src), text: document.body?.textContent?.slice(0, 300) })).catch(error => ({ url: frame.url(), error: String(error) })));
    }
    const cdp = await browser.newBrowserCDPSession();
    let targets;
    try { targets = (await cdp.send('Target.getTargets')).targetInfos.map(target => ({ type: target.type, url: target.url, title: target.title })); }
    finally { await cdp.detach(); }
    throw new Error('The installed product did not mount its marked React preview frame. ' + JSON.stringify({ browserVersion: browser.version(), frames, targets }));
  }
  private async settled(predicate: (value: RenderedPreview) => boolean = () => true): Promise<RenderedPreview> {
    const frame = await this.productFrame(), deadline = Date.now() + 30_000;
    let last: RenderedPreview | undefined;
    while (Date.now() < deadline) {
      const actual = await frame.evaluate(() => {
        const context = document.querySelector('[data-preview-context]'), panel = document.querySelector('[role="tabpanel"]');
        const image = document.querySelector<HTMLImageElement>('img[data-diagram-image]'), viewport = document.querySelector<HTMLElement>('[data-diagram-viewport]');
        const zoomInput = Array.from(document.querySelectorAll('label')).find(label => label.textContent?.trim() === 'Diagram zoom (%)')?.control;
        let svgLabels = '';
        if (image?.src.startsWith('data:image/svg+xml')) {
          const comma = image.src.indexOf(','), header = image.src.slice(0, comma), body = image.src.slice(comma + 1);
          const text = header.includes(';base64') ? atob(body) : decodeURIComponent(body);
          const svg = new DOMParser().parseFromString(text, 'image/svg+xml');
          svgLabels = Array.from(svg.querySelectorAll('text, tspan')).map(node => node.textContent ?? '').join('\n');
        }
        return { uri: context?.getAttribute('data-source-uri') ?? '', version: Number(context?.getAttribute('data-source-version')),
          ids: Array.from(document.querySelectorAll('[role="tab"][data-output-id]')).map(node => node.getAttribute('data-output-id') ?? ''),
          selectedId: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-output-id') ?? '',
          status: panel?.getAttribute('data-status') ?? '', path: panel?.getAttribute('data-document-path') ?? '', mediaType: panel?.getAttribute('data-media-type') ?? '',
          text: document.querySelector('[data-output-content]')?.textContent ?? '', explanation: document.querySelector('[data-output-explanation]')?.textContent ?? '',
          paths: Array.from(document.querySelectorAll('button[data-document-path]')).map(node => node.getAttribute('data-document-path') ?? ''),
          imageDecoded: !!image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0, svgLabels,
          zoom: zoomInput instanceof HTMLInputElement ? zoomInput.valueAsNumber : 0, imageWidth: image?.getBoundingClientRect().width ?? 0,
          naturalWidth: image?.naturalWidth ?? 0, imageHeight: image?.getBoundingClientRect().height ?? 0,
          imageWidthAttribute: image?.getAttribute('width') ?? null, imageHeightAttribute: image?.getAttribute('height') ?? null, viewportWidth: viewport?.clientWidth ?? 0, viewportHeight: viewport?.clientHeight ?? 0,
          scrollWidth: viewport?.scrollWidth ?? 0, scrollHeight: viewport?.scrollHeight ?? 0, left: viewport?.scrollLeft ?? 0, top: viewport?.scrollTop ?? 0 };
      });
      last = actual;
      // Decoding can finish before React commits the image's displayed dimensions.
      const imageReady = actual.mediaType !== 'image/svg+xml' || actual.imageDecoded
        && [Number(actual.imageWidthAttribute), Number(actual.imageHeightAttribute)].every(size => Number.isFinite(size) && size > 0)
        && actual.imageWidth > 0 && actual.imageHeight > 0;
      if (actual.uri === this.editor?.uri && actual.version === this.editor.version && actual.status !== '' && actual.status !== 'pending' && imageReady && predicate(actual)) return actual;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The actual product preview did not settle for the current native source URI/version. ' + JSON.stringify({
      uri: last?.uri, version: last?.version, selectedId: last?.selectedId, status: last?.status, path: last?.path, mediaType: last?.mediaType,
      zoom: last?.zoom, initialWidth: this.initialDiagramWidth, imageDecoded: last?.imageDecoded,
      imageWidth: last?.imageWidth, imageHeight: last?.imageHeight, widthAttribute: last?.imageWidthAttribute, heightAttribute: last?.imageHeightAttribute }));
  }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedEditor(); }
  private async disposeOwnedEditor(): Promise<void> {
    await this.opening?.catch(() => undefined);
    try { await this.session?.disposePreviewEditor(this.id); }
    catch (error) { throw new NativeCleanupError('Owned preview editor cleanup is unconfirmed; retained ' + this.directory, { cause: error }); }
    if (this.directory) await removeOwnedDirectory(this.directory);
  }
}
function key(id: string, path: string): string { return JSON.stringify([id, path]); }
async function ownedTree(directory: string): Promise<string> {
  const entries: { path: string; kind: string; bytes?: string }[] = [];
  async function visit(local = ''): Promise<void> {
    for (const entry of await readdir(join(directory, local), { withFileTypes: true })) {
      const path = local ? local + '/' + entry.name : entry.name;
      if (entry.isDirectory()) { entries.push({ path, kind: 'directory' }); await visit(path); }
      else if (entry.isFile()) entries.push({ path, kind: 'file', bytes: (await readFile(join(directory, path))).toString('base64') });
      else throw new Error('Owned preview files must be ordinary files/directories.');
    }
  }
  await visit(); return JSON.stringify(entries.sort((a, b) => a.path.localeCompare(b.path)));
}

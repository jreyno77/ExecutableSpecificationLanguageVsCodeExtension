import { randomUUID } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Frame } from 'playwright';
import { GenerationProject } from '../generation-on-save.js';
import { NativeCleanupError } from './native-process.js';
import { VsCodeSession, type GenerationEditorObservation } from './vscode-session.js';

type NativeGenerationPresentation = { status: string; explanation: string; log: string };

/** Classifies only the recorded cleanup evidence; it cannot establish process termination. */
export function generationCleanupState(record: string): 'unconfirmed' | 'pending' | 'settled' {
  if (/Forced owned child cleanup|descendants? (?:may|remain|cannot|unconfirmed)|(?:cleanup|termination) (?:is |was )?unconfirmed|cleanup (?:failed|was not accepted)/i.test(record)) return 'unconfirmed';
  const warnings = [
    'Native descendant state is unconfirmed;',
    'Forced owned Node child cleanup after failed IPC;',
    'Owned child CLOSE was not observed after forced cleanup;',
    'Owned generation child has no SDK terminal result; CLOSE remains unconfirmed.',
    'Generation parent IPC was lost; effects may be partial or uncertain.',
    'Forced cleanup left uncertain effects.',
  ];
  if (warnings.some(warning => record.includes(warning))) return 'unconfirmed';
  let lastStart = -1, lastFinish = -1;
  for (const match of record.matchAll(/^\[generating\]/gm)) lastStart = match.index;
  for (const match of record.matchAll(/^(?:Exit \d+|Generation error: )/gm)) lastFinish = match.index;
  return lastStart < 0 || lastFinish > lastStart ? 'settled' : 'pending';
}
/** Each case owns saved inputs and mutable buffers; one installed host provides real native observations. */
export class NativeGenerationCase {
  private readonly id = randomUUID();
  private project?: GenerationProject;
  private other?: GenerationProject;
  private selected?: GenerationProject;
  private session?: VsCodeSession;
  private editor?: GenerationEditorObservation;
  private frame?: Frame;
  private opening?: Promise<void>;
  private disposal?: Promise<void>;
  private publicationOffset = 0;
  private savedIntent = false;
  private presentation?: NativeGenerationPresentation;
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly source: string, private readonly otherEntry: string, private readonly enabled: boolean,
    private readonly outputs: boolean, private readonly missingRuntime: boolean, private readonly workspace: string) {}

  open(): Promise<void> { return this.opening ??= this.openOwnedEditor(); }
  private async openOwnedEditor(): Promise<void> {
    this.project = this.selected = await GenerationProject.create(this.source, this.otherEntry, this.outputs, this.workspace);
    const absent = join(this.project.directory, 'absent-owned-node.exe');
    if (this.missingRuntime) {
      try { await lstat(absent); throw new Error('The owned missing executable unexpectedly exists.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    this.session = await this.getSession();
    this.editor = await this.session.openGenerationEditor(this.id, this.extensionId, {
      file: this.project.main, other: this.project.other, directory: this.project.directory, workspace: this.workspace,
      configurationFile: this.project.manifest, resetFile: join(this.workspace, 'missing-generation-reset-' + this.id + '.json'),
      nodeExecutable: this.missingRuntime ? absent : process.execPath, enabled: this.enabled,
    });
    await this.settledSelection(this.enabled ? 'idle' : 'disabled');
  }
  private async action(kind: string, values: Record<string, unknown> = {}): Promise<void> {
    await this.open(); this.editor = await this.session!.changeGenerationEditor(this.id, kind, values);
  }
  edit(text: string): Promise<void> { return this.action('edit', { text }); }
  async save(): Promise<void> {
    this.publicationOffset = (await this.observe()).log.length; this.savedIntent = true;
    await this.action('save');
  }
  saveOther(text: string): Promise<void> { return this.action('otherSave', { text }); }
  dirtyOther(text: string): Promise<void> { return this.action('otherEdit', { text }); }
  async setEnabled(enabled: boolean): Promise<void> {
    await this.action('enable', { enabled }); await this.settledSelection(enabled ? 'idle' : 'disabled');
  }
  async keepImplementation(path: string, body: string): Promise<void> {
    await this.open(); const project = this.selected!;
    await this.action('keep', { file: join(project.target, path), text: await project.implementationText(path, body) });
  }
  async dirtyTarget(path: string, body: string): Promise<void> {
    await this.open(); const project = this.selected!;
    await this.action('dirtyTarget', { file: join(project.target, path), text: await project.implementationText(path, body) });
  }
  async selectOther(): Promise<void> {
    await this.open();
    this.other ??= await GenerationProject.create(this.source, this.otherEntry, false, this.workspace);
    await this.action('selectOther', { file: this.other.main, other: this.other.other,
      configurationFile: this.other.manifest, directory: this.other.directory });
    this.selected = this.other; this.savedIntent = false;
    await this.settledSelection('disabled');
  }
  async selectOriginal(): Promise<void> {
    await this.action('selectOriginal'); this.selected = this.project; this.savedIntent = false;
    await this.settledSelection(this.enabled ? 'idle' : 'disabled');
  }
  async settle(): Promise<void> {
    const deadline = Date.now() + 60_000;
    let last: NativeGenerationPresentation | undefined;
    while (Date.now() < deadline) {
      last = await this.observe();
      const terminal = last.status !== '' && !['generating', 'queued'].includes(last.status);
      const fresh = !this.savedIntent || /^\[(?:built|blocked|disabled|failed|refused|cancelled|idle)\]/m.test(last.log.slice(this.publicationOffset));
      if (terminal && fresh) { this.presentation = last; return; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The actual installed generation did not publish a fresh terminal state: ' + JSON.stringify({ status: last?.status, explanation: last?.explanation, tail: last?.log.slice(-1000) }));
  }
  private async settledSelection(status: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const actual = await this.observe(); if (actual.status === status) { this.presentation = actual; return; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The actual native selection did not present ' + status + '.');
  }
  private async productFrame(): Promise<Frame> {
    if (this.frame && !this.frame.isDetached()) return this.frame;
    const browser = await this.session!.webviewBrowser(), deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const found: Frame[] = [];
      for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
        if (await frame.locator('.monaco-workbench').count().catch(() => 0)) found.push(frame);
      }
      if (found.length > 1) throw new Error('Multiple native workbenches are present in the owned host.');
      if (found.length === 1) return this.frame = found[0];
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The owned native workbench did not expose its actual status bar.');
  }
  private async observe(): Promise<NativeGenerationPresentation> {
    if (!this.session || !this.editor) throw new Error('No actual native generation editor is open.');
    this.editor = await this.session.observeGenerationEditor(this.id);
    const frame = await this.productFrame();
    const rendered = await frame.evaluate(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('.statusbar-item'))
        .filter(item => item.textContent?.trim().startsWith('.expec Generation: ') && item.getBoundingClientRect().width > 0);
      return items.map(item => ({ text: item.textContent?.trim() ?? '', title: item.getAttribute('title') ?? '' }));
    });
    if (rendered.length !== 1) throw new Error('Expected one actually rendered .expec Generation status item, observed ' + rendered.length);
    const documents = this.editor.outputDocuments.filter(document => decodeURIComponent(document.uri).includes('.expec Generation'));
    if (documents.length !== 1) throw new Error('Expected the actual shown generation output document, observed ' + documents.length);
    const log = documents[0].text, status = rendered[0].text.slice('.expec Generation: '.length);
    const lines = log.split(/\r?\n/), line = [...lines].reverse().find(value => value.startsWith('[' + status + '] '));
    return { status, explanation: line?.slice(status.length + 3) ?? rendered[0].title, log };
  }
  async status(): Promise<string> { return (await this.observe()).status; }
  async explanation(): Promise<string> { return (await this.observe()).explanation; }
  async runtimeVersion(): Promise<string> {
    const actual = await this.observe();
    return /^Node ([^\r\n]+)$/m.exec(actual.log.slice(this.publicationOffset))?.[1] ?? '';
  }
  async fileIncludes(path: string, text: string): Promise<boolean> { await this.open(); return this.selected!.fileIncludes(path, text); }
  async unchanged(): Promise<boolean> {
    await this.open();
    return JSON.stringify(await this.project!.tree()) === JSON.stringify(this.project!.before)
      && (!this.other || JSON.stringify(await this.other.tree()) === JSON.stringify(this.other.before));
  }
  async dirtyTextIncludes(text: string): Promise<boolean> {
    await this.observe(); return this.editor!.dirtyBuffers.some(buffer => buffer.dirty && buffer.text.includes(text));
  }
  async launchExplanationIncludes(text: string): Promise<boolean> {
    const actual = await this.observe(); return actual.explanation.includes(text) || actual.log.slice(this.publicationOffset).includes(text);
  }
  async diagramIncludes(text: string): Promise<boolean> {
    await this.open(); const directory = join(this.selected!.target, 'diagrams');
    const files = (await readdir(directory)).filter(name => name.endsWith('.svg'));
    if (!files.length) throw new Error('The actual configured UML output has no saved SVG.');
    const frame = await this.productFrame();
    for (const name of files) {
      const saved = await readFile(join(directory, name), 'utf8');
      const labels = await frame.evaluate(svg => {
        const actual = new DOMParser().parseFromString(svg, 'image/svg+xml');
        if (actual.querySelector('parsererror')) throw new Error('The actual saved SVG is malformed.');
        return Array.from(actual.querySelectorAll('text, tspan')).map(node => node.textContent ?? '').join('\n');
      }, saved);
      if (labels.includes(text)) return true;
    }
    return false;
  }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedEditor(); }
  private async disposeOwnedEditor(): Promise<void> {
    await this.opening?.catch(() => undefined);
    let confirmed = false;
    try {
      if (this.session && this.editor) {
        this.editor = await this.session.changeGenerationEditor(this.id, 'enable', { enabled: false });
        // A disabled publication alone does not establish that an admitted child settled.
        const deadline = Date.now() + 60_000;
        while (true) {
          const actual = await this.observe(), tail = actual.log.slice(this.publicationOffset);
          const cleanup = generationCleanupState(tail);
          if (cleanup === 'unconfirmed') {
            throw new NativeCleanupError('The actual generation record reports unconfirmed child/descendant cleanup; its owned target is retained.');
          }
          if (cleanup === 'settled') break;
          if (Date.now() >= deadline) throw new Error('The admitted generation child has no actual terminal output receipt.');
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        await this.session.disposeGenerationEditor(this.id);
      }
      confirmed = true;
    } catch (error) { throw new NativeCleanupError('Generation buffer/worker cleanup is unconfirmed; retained ' + this.project?.directory, { cause: error }); }
    finally {
      if (confirmed) {
        const settled = await Promise.allSettled([this.project?.dispose(), this.other?.dispose()]);
        const failed = settled.find(value => value.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
      }
    }
  }
}

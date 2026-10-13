import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Frame, Page } from 'playwright';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';
import { type SidebarManagementAction, type SidebarObservation, VsCodeSession } from './vscode-session.js';

/** One mutable sidebar case, sharing the suite-owned installed extension host. */
export class ConnectionSidebarCase {
  private readonly id = randomUUID();
  private directory: string | undefined;
  private session: VsCodeSession | undefined;
  private opening: Promise<void> | undefined;
  private disposal: Promise<void> | undefined;
  private actual: SidebarObservation | undefined;
  private setupFailure: unknown;
  private beforeTrees: string | undefined;
  private menuActions: string[] | undefined;
  private previewFrame: Frame | undefined;
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly configuration: string | undefined, private readonly directories: readonly string[], private readonly workspace: string) {}

  get last(): SidebarObservation { if (!this.actual) throw new Error('No actual native sidebar observation.'); return this.actual; }
  open(): Promise<void> { return this.opening ??= this.openOwnedSidebar(); }
  private async openOwnedSidebar(): Promise<void> {
    for (const name of this.directories) if (basename(name) !== name || name === '.' || name === '..') throw new Error('Use one owned project directory name.');
    this.directory = await ownTemporaryDirectory('expec-connection-sidebar-', this.workspace);
    await Promise.all(this.directories.map(name => mkdir(join(this.directory!, name))));
    const file = join(this.directory, 'expec.json');
    if (this.configuration !== undefined) await writeFile(file, this.configuration);
    this.beforeTrees = await ownedTrees(this.directory);
    try { this.session = await this.getSession(); }
    catch (error) { if (error instanceof NativeCleanupError) this.setupFailure = error; throw error; }
    try {
      this.actual = await this.session.openConnectionSidebar(this.id, this.extensionId,
        { file, directory: this.directory, resetFile: join(this.workspace, 'expec.json') });
    } catch (error) { this.setupFailure = error; throw error; }
  }
  async observe(): Promise<void> {
    if (this.disposal) throw new Error('The owned sidebar is disposing.');
    await this.open(); this.actual = await this.session!.observeConnectionSidebar(this.id);
  }
  choose(name: string): Promise<void> { return this.action('choose', name); }
  save(text: string): Promise<void> { return this.action('save', undefined, text); }
  remove(name: string): Promise<void> { return this.action('remove', name); }
  restore(name: string): Promise<void> { return this.action('restore', name); }
  edit(text: string): Promise<void> { return this.action('edit', undefined, text); }
  private async action(kind: 'choose' | 'save' | 'remove' | 'restore' | 'edit', name?: string, text?: string): Promise<void> {
    if (this.disposal) throw new Error('The owned sidebar is disposing.');
    await this.open(); this.actual = await this.session!.changeConnectionSidebar(this.id, kind, name, text);
  }
  async openActivityBar(): Promise<void> {
    await this.open(); await this.session!.webviewBrowser();
    await this.manage({ kind: 'activityBar' });
    await (await this.workbench()).locator('[id="workbench.view.extension.expec"]').waitFor({ state: 'visible', timeout: 30_000 });
  }
  async openConnectionMenu(): Promise<void> {
    const page = await this.workbench(), view = page.locator('[id="workbench.view.extension.expec"]');
    await view.getByRole('treeitem').first().click({ button: 'right' });
    const menu = page.locator('.context-view .monaco-menu');
    await menu.waitFor({ state: 'visible', timeout: 30_000 });
    this.menuActions = await menu.locator('.action-label').allTextContents();
    this.menuActions = this.menuActions.map(label => label.trim()).filter(label => label !== '');
  }
  async editConnection(): Promise<void> {
    await (await this.workbench()).keyboard.press('Escape');
    await this.manage({ kind: 'editConnection' });
  }
  newConnection(target: string, outputs: readonly { id: string; directory?: string }[], entries: readonly string[]): Promise<void> {
    return this.guideConnection(target, outputs, entries, false);
  }
  cancelNewAtDestination(target: string, outputs: readonly string[]): Promise<void> {
    return this.guideConnection(target, outputs.map(id => ({ id })), [], true);
  }
  disconnect(): Promise<void> { return this.manage({ kind: 'disconnect' }); }
  reconnect(): Promise<void> { return this.manage({ kind: 'reconnect' }); }
  deleteConnection(confirmed: boolean): Promise<void> {
    return this.dialogCommand({ kind: 'delete' }, async page => {
      const dialog = page.getByRole('dialog').filter({ hasText: 'Delete the project connection from ' + join(this.directory!, 'expec.json') });
      if (!await dialog.isVisible()) return false;
      await dialog.getByRole('button', { name: confirmed ? 'Delete Connection' : 'Cancel', exact: true }).click({ timeout: 10_000 });
      return true;
    });
  }
  async keepSource(path: string, text: string): Promise<void> {
    if (!path.endsWith('.expec')) throw new Error('Keep an actual authored .expec source.');
    await this.keepFile(path, text);
  }
  async keepTargetFile(directory: string, path: string, text: string): Promise<void> {
    if (!this.directories.includes(directory)) throw new Error('Keep target files only in a supplied owned target.');
    await this.keepFile(directory + '/' + path, text);
  }
  private async keepFile(path: string, text: string): Promise<void> {
    await this.open();
    const file = this.ownedPath(path);
    if (file === join(this.directory!, 'expec.json')) throw new Error('Keep source/target files separately from selected metadata.');
    const baseline: Array<{ path: string; kind: string; bytes?: string }> = JSON.parse(this.beforeTrees!);
    const createdParents: string[] = [];
    for (let parent = dirname(file); parent !== this.directory; parent = dirname(parent)) {
      try { const info = await lstat(parent); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The fixture parent is not an ordinary directory.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; createdParents.push(parent); }
    }
    await mkdir(dirname(file), { recursive: true }); await writeFile(file, text);
    const bytes = Buffer.from(text).toString('base64');
    if ((await readFile(file)).toString('base64') !== bytes) throw new Error('The arranged sidebar fixture changed while it was written.');
    const fixture = relative(this.directory!, file).replaceAll('\\', '/');
    const retained = baseline.filter(entry => entry.path !== fixture);
    retained.push({ path: fixture, kind: 'file', bytes });
    for (const parent of createdParents) {
      const path = relative(this.directory!, parent).replaceAll('\\', '/');
      if (!retained.some(entry => entry.path === path)) retained.push({ path, kind: 'directory' });
    }
    this.beforeTrees = JSON.stringify(retained.sort((a, b) => a.path.localeCompare(b.path)));
  }
  async previewSource(source: string): Promise<void> {
    await this.open(); await this.session!.webviewBrowser();
    await this.manage({ kind: 'previewSource', source }); this.previewFrame = undefined;
    await this.productFrame();
  }
  async activityBarVisible(): Promise<boolean> {
    const page = await this.workbench(), installed = await this.session!.extensionPath(this.extensionId);
    if (!installed) throw new Error('The actual installed extension path is unavailable.');
    const observed = await page.evaluate(async ({ root, windows }) => {
      const labelledNodes = Array.from(document.querySelectorAll<HTMLElement>('.activitybar [aria-label]'));
      const labels = labelledNodes.slice(0, 40).map(node => (node.getAttribute('aria-label') ?? '').slice(0, 160));
      const facts: Record<string, unknown>[] = [];
      for (const labelled of labelledNodes) {
        if (!/^\.expec(?:\s|$)/.test(labelled.getAttribute('aria-label') ?? '')) continue;
        for (const icon of [labelled, ...labelled.querySelectorAll<HTMLElement>('*')]) {
          const box = icon.getBoundingClientRect(), style = getComputedStyle(icon);
          const fact: Record<string, unknown> = { label: (labelled.getAttribute('aria-label') ?? '').slice(0, 160),
            tag: icon.tagName, class: (icon.getAttribute('class') ?? '').slice(0, 200),
            box: { width: box.width, height: box.height }, display: style.display, visibility: style.visibility };
          if (facts.length < 8) facts.push(fact);
          if (box.width <= 0 || box.height <= 0 || style.display === 'none' || style.visibility !== 'visible') { fact.reason = 'not-visible'; continue; }
          const paint = [style.maskImage, style.getPropertyValue('-webkit-mask-image'), style.backgroundImage]
            .find(value => value && value !== 'none' && value.includes('url(')) ?? '';
          const match = /url\(["']?(.+?)["']?\)/.exec(paint);
          fact.paint = paint.slice(0, 1000);
          if (!match) { fact.reason = 'no-css-resource'; continue; }
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const resource = new URL(match[1]);
            const filename = decodeURIComponent(resource.pathname).replace(/^\/([A-Za-z]:\/)/, '$1');
            const actualPath = windows ? filename.toLowerCase() : filename, installedRoot = windows ? root.toLowerCase() : root;
            fact.resource = resource.href.slice(0, 1000);
            fact.insideInstallation = actualPath.startsWith(installedRoot + '/');
            if (resource.protocol !== 'vscode-file:' || resource.hostname !== 'vscode-app'
              || !actualPath.startsWith(installedRoot + '/') || !actualPath.endsWith('.svg')) { fact.reason = 'not-installed-svg'; continue; }
            // Decode the actual displayed CSS resource and reject a blank packaged icon.
            fact.reason = 'decoding';
            const image = new Image(); image.src = resource.href;
            await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native icon decode did not settle.')), 3_000); })]);
            fact.natural = { width: image.naturalWidth, height: image.naturalHeight };
            if (image.naturalWidth <= 0 || image.naturalHeight <= 0) { fact.reason = 'decoded-empty'; continue; }
            const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 24;
            fact.reason = 'reading-paint';
            const context = canvas.getContext('2d'); if (!context) { fact.reason = 'no-canvas-context'; continue; }
            context.drawImage(image, 0, 0, 24, 24);
            const pixels = context.getImageData(0, 0, 24, 24).data;
            if (pixels.some((value, index) => index % 4 === 3 && value > 0)) return { visible: true, root: root.slice(0, 1000), labels, facts };
            fact.reason = 'blank-pixels';
          } catch (error) { fact.error = String(error).slice(0, 400); }
          finally { if (timer) clearTimeout(timer); }
        }
      }
      return { visible: false, root: root.slice(0, 1000), labels, facts };
    }, { root: installed.replaceAll('\\', '/').replace(/\/+$/, ''), windows: process.platform === 'win32' });
    if (!observed.visible) console.error('Actual installed .expec Activity Bar icon observation failed: ' + JSON.stringify(observed));
    return observed.visible;
  }
  async selectedConfigurationVisible(): Promise<boolean> {
    const page = await this.workbench(), view = page.locator('[id="workbench.view.extension.expec"]'), file = join(this.directory!, 'expec.json');
    if (!await view.isVisible() || !(await view.innerText()).includes(basename(file))) return false;
    const row = view.getByRole('treeitem').filter({ hasText: basename(file) }).first();
    const bounds = await row.boundingBox();
    if (!bounds) return false;
    // A dismissed native hover stays suppressed while its pointer remains on the row.
    await page.mouse.move(bounds.x + bounds.width + 1, bounds.y + bounds.height + 1);
    await row.hover();
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const visible = await view.innerText();
      const hover = await page.locator('.monaco-hover:visible').allTextContents();
      if ([visible, ...hover].some(text => text.includes(file))) return true;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return false;
  }
  visibleConnectionActions(): string[] {
    if (!this.menuActions) throw new Error('Open the actual connection context menu before observing its actions.');
    return [...this.menuActions];
  }
  editingSelectedConfiguration(): boolean { return this.last.activeFile !== undefined && samePath(this.last.activeFile, join(this.directory!, 'expec.json')); }
  savedEntries(): string[] { return stringList(this.savedObject().build?.entries, 'actual saved build entries'); }
  savedOutputIds(): string[] { return this.savedOutputs().map(output => { if (typeof output.id !== 'string') throw new Error('Actual saved output ID is not text.'); return output.id; }); }
  savedOutputOptions(id: string): string {
    const output = this.savedOutputs().find(output => output.id === id);
    if (!output) throw new Error('The actual saved manifest does not contain output ' + id + '.');
    return canonicalJSON(output.options);
  }
  savedVersion(): string { const version = this.savedObject().version; if (typeof version !== 'string') throw new Error('Actual saved version is not text.'); return version; }
  savedPackages(): string { return canonicalJSON(this.savedObject().packages); }
  async ownedTreesUnchanged(): Promise<boolean> { return this.beforeTrees === await ownedTrees(this.directory!); }
  async previewDocumentIncludes(id: string, path: string, text: string): Promise<boolean> {
    const frame = await this.productFrame();
    const tabSelector = await frame.evaluate(id => '[role="tab"][data-output-id="' + CSS.escape(id) + '"]', id);
    await frame.locator(tabSelector).click({ timeout: 30_000 });
    const documentSelector = await frame.evaluate(path => 'button[data-document-path="' + CSS.escape(path) + '"]', path);
    await frame.locator(documentSelector).click({ timeout: 30_000 });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const actual = await frame.evaluate(() => {
        const context = document.querySelector('[data-preview-context]'), panel = document.querySelector('[role="tabpanel"]');
        return { uri: context?.getAttribute('data-source-uri'), version: Number(context?.getAttribute('data-source-version')),
          id: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-output-id'),
          path: panel?.getAttribute('data-document-path'), status: panel?.getAttribute('data-status'),
          text: document.querySelector('[data-output-content]')?.textContent ?? '' };
      });
      if (actual.uri === this.last.sourceUri && actual.version === this.last.sourceVersion && actual.id === id && actual.path === path && actual.status !== 'pending' && actual.status) {
        return actual.status === 'ready' && actual.text.includes(text);
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The actual sidebar source preview did not settle for its current source and selected document.');
  }
  private async guideConnection(target: string, outputs: readonly { id: string; directory?: string }[],
    entries: readonly string[], cancelDestination: boolean): Promise<void> {
    const answered = new Set<string>();
    let reachedDestination = false;
    await this.dialogCommand({ kind: 'newConnection' }, async page => {
      const widget = page.locator('.quick-input-widget:visible');
      if (!await widget.isVisible()) return false;
      const title = (await widget.locator('.quick-input-title').innerText()).trim();
      if (answered.has(title)) return false;
      if (title === 'Choose an empty or existing local target') {
        await widget.getByRole('textbox').fill(this.ownedPath(target) + (process.platform === 'win32' ? '\\' : '/'));
        await widget.getByRole('button', { name: 'New Connection', exact: true }).click({ timeout: 10_000 });
      } else if (title === 'Choose outputs for this connection') {
        const rows = await widget.locator('.quick-input-list .monaco-list-row').all();
        if (!rows.length) return false;
        const offered: string[] = [];
        for (const row of rows) {
          const id = (await row.locator('.label-name').first().innerText()).trim(); offered.push(id);
          const contained = row.locator('input[type="checkbox"], [role="checkbox"]').first();
          const checkbox = await contained.count() ? contained : row;
          const aria = await checkbox.getAttribute('aria-checked');
          const checked = aria === null ? await checkbox.isChecked() : aria === 'true';
          if (checked !== outputs.some(output => output.id === id)) await checkbox.click({ timeout: 10_000 });
        }
        if (outputs.some(output => !offered.includes(output.id))) throw new Error('The actual native output picker did not offer the authored output choices. ' + JSON.stringify(offered));
        await widget.getByRole('button', { name: 'OK', exact: true }).click({ timeout: 10_000 });
      } else if (title.endsWith(' output destination')) {
        reachedDestination = true;
        if (cancelDestination) await page.keyboard.press('Escape');
        else {
          const id = title.slice(0, -' output destination'.length), choice = outputs.find(output => output.id === id);
          if (choice?.directory === undefined) throw new Error('The actual native guide requested an unprovided author destination: ' + title);
          await widget.getByRole('textbox').fill(choice.directory);
          await widget.getByRole('textbox').press('Enter');
        }
      } else if (title === 'Choose actual saved sources in the manifest folder') {
        if (entries.length !== 1) throw new Error('The current native literal requires one actual saved source choice; multiple-source UI selection is unbound.');
        await widget.getByRole('textbox').fill(this.ownedPath(entries[0]));
        await widget.getByRole('button', { name: 'Use Source Entries', exact: true }).click({ timeout: 10_000 });
      } else throw new Error('An unexpected actual native picker opened: ' + title);
      answered.add(title); return true;
    });
    if (cancelDestination && !reachedDestination) throw new Error('Cancellation did not reach the actual output destination input.');
  }
  private async dialogCommand(action: SidebarManagementAction, answer: (page: Page) => Promise<boolean>): Promise<void> {
    const page = await this.workbench(), deadline = Date.now() + 30_000;
    let finished = false, commandFailure: unknown;
    // The worker queue waits for this command. CDP answers its actual UI independently.
    const command = this.manage(action).then(() => { finished = true; }, error => { commandFailure = error; finished = true; });
    const failures: unknown[] = [];
    try {
      while (!finished) {
        if (Date.now() >= deadline) throw new Error('The actual native dialog sequence did not settle. ' + JSON.stringify(await this.dialogState(page)));
        if (!await answer(page)) {
          if (!await this.dismissRefusal(page)) await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
    } catch (error) {
      let state: unknown;
      try { state = await this.dialogState(page); } catch (diagnosticError) { state = { unavailable: String(diagnosticError) }; }
      failures.push(new Error('Actual native dialog interaction failed: ' + String(error) + ' ' + JSON.stringify(state), { cause: error }));
    }
    finally {
      if (!finished) {
        const cleanupDeadline = Date.now() + 5_000;
        try {
          while (!finished && Date.now() < cleanupDeadline) {
            if (!await this.dismissRefusal(page) && (await page.getByRole('dialog').isVisible() || await page.locator('.quick-input-widget:visible').isVisible())) await page.keyboard.press('Escape');
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          if (!finished) failures.push(new Error('The owned pending native command did not settle after dialog cancellation.'));
        } catch (error) { failures.push(error); }
      }
      await command;
    }
    if (commandFailure) failures.push(commandFailure);
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, 'Actual native dialog interaction and owned cleanup failed.');
  }
  private async dismissRefusal(page: Page): Promise<boolean> {
    const refusal = page.locator('.notification-list-item:visible').filter({ hasText: /Save or revert changed configuration before (creating|deleting) a connection\./ });
    if (!await refusal.count()) return false;
    await refusal.hover({ timeout: 5_000 });
    await refusal.getByRole('button', { name: /^Clear Notification/ }).click({ timeout: 5_000 });
    return true;
  }
  private dialogState(page: Page): Promise<unknown> {
    return page.evaluate(() => Array.from(document.querySelectorAll('.quick-input-widget, .monaco-dialog-box')).map(node => ({
      title: node.querySelector('.quick-input-title')?.textContent, visible: (node as HTMLElement).offsetWidth > 0,
      inputs: Array.from(node.querySelectorAll('input')).map(input => ({ label: input.getAttribute('aria-label'), value: input.value })),
      buttons: Array.from(node.querySelectorAll('[role="button"]')).map(button => button.textContent?.trim()),
      rows: Array.from(node.querySelectorAll('.monaco-list-row')).map(row => ({ role: row.getAttribute('role'), label: row.getAttribute('aria-label'),
        text: row.querySelector('.label-name')?.textContent, checkbox: row.querySelector('input[type="checkbox"], [role="checkbox"]')?.outerHTML.slice(0,400) }))
    })));
  }
  private savedObject(): Record<string, any> {
    if (this.last.saved === undefined) throw new Error('The selected native manifest has no saved bytes.');
    const object: unknown = JSON.parse(this.last.saved);
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('The actual saved manifest is not an object.');
    return object as Record<string, any>;
  }
  private savedOutputs(): Record<string, any>[] {
    const outputs = this.savedObject().outputs;
    if (!Array.isArray(outputs) || !outputs.every(output => output && typeof output === 'object' && !Array.isArray(output))) throw new Error('The actual saved outputs are not objects.');
    return outputs;
  }
  private ownedPath(path: string): string {
    const file = resolve(this.directory!, path), local = relative(this.directory!, file);
    if (!local || isAbsolute(local) || local === '..' || local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('The fixture path left its owned sidebar directory.');
    return file;
  }
  private async manage(action: SidebarManagementAction): Promise<void> {
    if (this.disposal) throw new Error('The owned sidebar is disposing.');
    await this.open(); this.actual = await this.session!.manageConnectionSidebar(this.id, action);
  }
  private async workbench(): Promise<Page> {
    await this.open(); const browser = await this.session!.webviewBrowser();
    const pages: Page[] = [];
    for (const context of browser.contexts()) for (const page of context.pages()) if (await page.locator('.monaco-workbench').count().catch(() => 0)) pages.push(page);
    if (pages.length !== 1) throw new Error('Expected the single actual workbench in the owned native session.');
    return pages[0];
  }
  private async productFrame(): Promise<Frame> {
    if (this.previewFrame && !this.previewFrame.isDetached()) return this.previewFrame;
    const browser = await this.session!.webviewBrowser(), deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const frames: Frame[] = [];
      for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
        if (await frame.locator('body[data-expec-output-previews]').count().catch(() => 0)) frames.push(frame);
      }
      if (frames.length > 1) throw new Error('More than one actual product preview frame exists in the owned native session.');
      if (frames.length === 1) return this.previewFrame = frames[0];
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The installed product did not mount its actual output preview frame.');
  }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedSidebar(); }
  private async disposeOwnedSidebar(): Promise<void> {
    await this.opening?.catch(() => undefined);
    if (this.setupFailure) throw new NativeCleanupError('Native sidebar setup cleanup is unconfirmed; retained ' + this.directory, { cause: this.setupFailure });
    try { await this.session?.disposeConnectionSidebar(this.id); }
    catch (error) { throw new NativeCleanupError('Owned sidebar cleanup is unconfirmed; retained ' + this.directory, { cause: error }); }
    if (this.directory) await removeOwnedDirectory(this.directory);
  }
}

function samePath(first: string, second: string): boolean { return process.platform === 'win32' ? resolve(first).toLowerCase() === resolve(second).toLowerCase() : resolve(first) === resolve(second); }
function stringList(value: unknown, name: string): string[] { if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Invalid ' + name + '.'); return [...value]; }
function canonicalJSON(value: unknown): string {
  const sorted = (item: any): any => Array.isArray(item) ? item.map(sorted) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
  const text = JSON.stringify(sorted(value)); if (text === undefined) throw new Error('No actual saved value to serialize.'); return text;
}
async function ownedTrees(directory: string): Promise<string> {
  const entries: { path: string; kind: string; bytes?: string }[] = [];
  async function visit(local = ''): Promise<void> {
    for (const entry of await readdir(join(directory, local), { withFileTypes: true })) {
      const path = local ? local + '/' + entry.name : entry.name;
      if (path === 'expec.json') continue;
      if (entry.isDirectory()) { entries.push({ path, kind: 'directory' }); await visit(path); }
      else if (entry.isFile()) entries.push({ path, kind: 'file', bytes: (await readFile(join(directory, path))).toString('base64') });
      else throw new Error('Owned sidebar source/target trees must contain ordinary files and directories.');
    }
  }
  await visit(); return JSON.stringify(entries.sort((a, b) => a.path.localeCompare(b.path)));
}

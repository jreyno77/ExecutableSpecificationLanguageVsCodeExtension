import { basename } from 'node:path';
import type { Locator, Page } from 'playwright';
import { InstalledExpecEditor } from './installed-extension.js';
import type { NativeDefinitionCase } from './native-definition.js';
import type { NativeReferenceObservation } from './vscode-session.js';

type VisibleCoverage = { coveredUris: readonly string[]; prerequisiteWords: readonly string[] };

/** Observes the installed client's own locations and the real native coverage messages. */
export class NativeReferencesRecording {
  private actual: NativeReferenceObservation | undefined;
  private page: Page | undefined;
  private summary: string | undefined;
  private coverage: VisibleCoverage | undefined;
  private summaryNotification: Locator | undefined;
  private detailNotification: Locator | undefined;
  private constructor(private readonly source: NativeDefinitionCase) {
    source.beforeDispose(() => this.clearCoverage());
  }
  static async open(sources: Readonly<Record<string, string>>): Promise<NativeReferencesRecording> {
    const editor = await InstalledExpecEditor.prepare();
    return new NativeReferencesRecording(await editor.definitionEditor(sources));
  }
  editEntry(text: string): Promise<void> { return this.source.editEntry(text); }
  editImport(text: string): Promise<void> { return this.source.editImport(text); }
  async find(line: number, column: number): Promise<void> {
    await this.clearCoverage();
    const page = this.page ??= await this.source.workbench();
    const existing = page.locator('.notification-list-item:visible').filter({ has: page.getByRole('button', { name: 'Show coverage', exact: true }) });
    if (await existing.count()) throw new Error('An earlier native reference coverage choice is still visible.');
    this.summary = undefined; this.coverage = undefined; this.actual = undefined;
    this.summaryNotification = existing;
    this.actual = await this.source.references(line, column);
  }
  async showCoverage(): Promise<void> {
    const request = this.observation(), page = this.page!;
    await this.current(request);
    const summary = page.locator('.notification-list-item:visible').filter({ has: page.getByRole('button', { name: 'Show coverage', exact: true }) });
    await summary.waitFor({ state: 'visible', timeout: 30_000 });
    if (await summary.count() !== 1) throw new Error('Expected one actual native Show coverage choice.');
    const actualMessage = await summary.locator('.notification-list-item-message').textContent();
    if (actualMessage === null) throw new Error('The visible native reference summary has no message.');
    this.summary = actualMessage.trim(); this.summaryNotification = summary;
    await this.current(request);
    await summary.getByRole('button', { name: 'Show coverage', exact: true }).click({ timeout: 30_000 });
    await summary.waitFor({ state: 'hidden', timeout: 30_000 });
    this.summaryNotification = undefined;
    const detail = page.locator('.notification-list-item:visible')
      .filter({ has: page.locator('.notification-list-item-message').filter({ hasText: 'Covered sources:' }) })
      .filter({ hasText: request.requestUri });
    await detail.waitFor({ state: 'visible', timeout: 30_000 });
    if (await detail.count() !== 1) throw new Error('Expected one actual owned native coverage detail message.');
    this.detailNotification = detail;
    await detail.hover();
    const expand = detail.getByRole('button', { name: /^Expand Notification/ });
    if (await expand.count()) await expand.click({ timeout: 5_000 });
    const message = detail.locator('.notification-list-item-message');
    const visibleDeadline = Date.now() + 5_000;
    while (!await message.evaluate(node => node.clientHeight > 0 && node.scrollHeight <= node.clientHeight + 1)) {
      if (Date.now() >= visibleDeadline) throw new Error('The native coverage detail text remains clipped.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const text = (await message.innerText()).trim();
    // Native notifications render the original line breaks as spaces in one visible span.
    const heading = 'Covered sources:', separator = 'Prerequisites:';
    const split = text.indexOf(separator);
    if (!text.startsWith(heading) || split < heading.length || text.indexOf(separator, split + separator.length) >= 0)
      throw new Error('The visible native coverage message has no distinct source/prerequisite sections. Actual rendering: ' + JSON.stringify(text));
    const words = (value: string) => value.split(/\s+/).filter(word => word !== '');
    const coveredUris = words(text.slice(heading.length, split));
    const prerequisiteWords = words(text.slice(split + separator.length));
    if (!coveredUris.includes(request.requestUri)) throw new Error('The visible coverage does not identify its actual requesting source.');
    await this.current(request);
    this.coverage = { coveredUris, prerequisiteWords };
  }
  private async current(request: NativeReferenceObservation): Promise<void> {
    const actual = await this.source.currentReferences();
    if (actual.requestUri !== request.requestUri || actual.requestVersion !== request.requestVersion
      || actual.requestResultId !== request.requestResultId || actual.requestPosition.line !== request.requestPosition.line
      || actual.requestPosition.character !== request.requestPosition.character)
      throw new Error('The visible native reference coverage belongs to an obsolete request.');
  }
  observation(): NativeReferenceObservation {
    if (!this.actual) throw new Error('No actual installed references reply was recorded.');
    return this.actual;
  }
  location(index: number): NativeReferenceObservation['locations'][number] {
    if (!Number.isInteger(index) || index < 1) throw new RangeError('Reference location indexes are positive integers.');
    const actual = this.observation().locations[index - 1];
    if (!actual) throw new Error('The actual native reference reply has no location ' + index);
    return actual;
  }
  usesOwnedFile(index: number, fileName: string): boolean {
    return this.location(index).uri === this.ownedUri(fileName);
  }
  coverageMessage(): string {
    if (this.summary === undefined) throw new Error('No actual visible reference coverage summary was recorded.');
    return this.summary;
  }
  coveredFile(fileName: string): boolean { return this.visibleCoverage().coveredUris.includes(this.ownedUri(fileName)); }
  unavailableFile(fileName: string): boolean {
    if (basename(fileName) !== fileName || fileName === '.' || fileName === '..') throw new Error('Coverage requires one owned source name.');
    const uri = new URL(fileName, this.observation().entryUri).href;
    const words = this.visibleCoverage().prerequisiteWords;
    return words.some((word, index) => word === 'Unavailable' && words[index + 1] === 'source:' && words[index + 2] === uri);
  }
  prerequisite(code: string): boolean { return this.visibleCoverage().prerequisiteWords.includes(code + ':'); }
  dirtyImport(): boolean { return this.observation().importDirty; }
  dirtyEntry(): boolean { return this.observation().entryDirty; }
  filesUnchanged(): Promise<boolean> { return this.source.filesUnchanged(); }
  private ownedUri(fileName: string): string {
    const uri = this.observation().ownedUris[fileName];
    if (uri === undefined) throw new Error('No actual owned native source named ' + fileName);
    return uri;
  }
  private visibleCoverage(): VisibleCoverage {
    if (!this.coverage) throw new Error('No actual visible reference coverage details were recorded.');
    return this.coverage;
  }
  private async clearCoverage(): Promise<void> {
    for (const notification of [this.summaryNotification, this.detailNotification]) {
      if (!notification || !await notification.count()) continue;
      await notification.hover();
      await notification.getByRole('button', { name: /^Clear Notification/ }).click({ timeout: 5_000 });
      await notification.waitFor({ state: 'hidden', timeout: 5_000 });
    }
    this.summaryNotification = undefined; this.detailNotification = undefined;
  }
}
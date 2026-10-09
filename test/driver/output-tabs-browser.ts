import { afterAll, beforeAll, inject, onTestFinished } from 'vitest';
import type { Browser, Page } from 'playwright';
import type {} from './output-tabs-setup.js';
import type { OutputTabs } from '../../src/ui/OutputTabs.js';
import type { OutputTab } from '../../src/core/OutputTab.js';

declare global {
  interface Window { outputTabs: OutputTabs; createOutputTabs(hostElementId?: string): void }
}
let shared: Promise<Browser> | undefined;
beforeAll(async () => {
  if (inject('outputTabs')) {
    shared = import('playwright').then(({ chromium }) => chromium.launch({ headless: true }));
    await shared;
  }
});
afterAll(async () => { await (await shared?.catch(() => undefined))?.close(); });

export class OutputTabsBrowser {
  private constructor(readonly page: Page) {}
  static async open(): Promise<OutputTabsBrowser> {
    const session = inject('outputTabs');
    const browser = await shared;
    if (!browser) throw new Error('Output tabs require the UI test project.');
    const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
    onTestFinished(() => context.close());
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    await page.goto(session.url + 'test/resources/output-tabs.html');
    await page.waitForFunction(() => typeof window.createOutputTabs === 'function');
    await page.evaluate(() => window.createOutputTabs());
    return new OutputTabsBrowser(page);
  }
  async construct(hostElementId: string): Promise<void> {
    await this.page.evaluate(id => window.createOutputTabs(id), hostElementId);
  }
  async present(tabs: OutputTab[]): Promise<void> {
    await this.page.evaluate(tabs => window.outputTabs.present(tabs), tabs);
  }
  async select(id: string): Promise<void> {
    const selector = await this.page.evaluate(id => '[role="tab"][data-output-id="' + CSS.escape(id) + '"]', id);
    await this.page.locator(selector).click();
  }
  labels(): Promise<string[]> { return this.page.getByRole('tab').allTextContents(); }
  content(): Promise<string> {
    return this.page.evaluate(() => document.querySelector('[data-output-content]')?.textContent ?? '');
  }
  async selectDocument(path: string): Promise<void> {
    const selector = await this.page.evaluate(path => 'button[data-document-path="' + CSS.escape(path) + '"]', path);
    await this.page.locator(selector).click();
  }
  async setZoom(percent: number): Promise<void> { await this.page.getByLabel('Diagram zoom (%)', { exact: true }).fill(String(percent)); }
  async resetZoom(): Promise<void> { await this.page.getByRole('button', { name: 'Reset zoom', exact: true }).click(); }
  async scrollDiagram(horizontal: number, vertical: number): Promise<void> {
    await this.page.locator('[data-diagram-viewport]').evaluate((node, position) => node.scrollTo(position.horizontal, position.vertical), { horizontal, vertical });
  }
  selectedId(): Promise<string> { return this.page.getByRole('tab', { selected: true }).getAttribute('data-output-id').then(value => value ?? ''); }
  status(): Promise<string> { return this.page.getByRole('tabpanel').getAttribute('data-status').then(value => value ?? ''); }
  explanation(): Promise<string> { return this.page.evaluate(() => document.querySelector('[data-output-explanation]')?.textContent ?? ''); }
  documentPaths(): Promise<string[]> { return this.page.locator('button[data-document-path]').allTextContents(); }
  documentPath(): Promise<string> { return this.page.getByRole('tabpanel').getAttribute('data-document-path').then(value => value ?? ''); }
  async imageLoaded(): Promise<boolean> {
    if (!await this.page.locator('img[data-diagram-image]').count()) return false;
    await this.page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>('img[data-diagram-image]');
      if (!image?.complete) return false;
      if (!image.naturalWidth) return true;
      const dimensions = [Number(image.getAttribute('width')), Number(image.getAttribute('height'))];
      const displayed = image.getBoundingClientRect();
      return dimensions.every(value => Number.isFinite(value) && value > 0) && displayed.width > 0 && displayed.height > 0;
    });
    return this.page.locator('img[data-diagram-image]').evaluate(node => (node as HTMLImageElement).naturalWidth > 0);
  }
  zoom(): Promise<number> { return this.page.getByLabel('Diagram zoom (%)', { exact: true }).inputValue().then(Number); }
  displayedWidth(): Promise<number> { return this.page.locator('img[data-diagram-image]').evaluate(node => node.getBoundingClientRect().width); }
  scrollLeft(): Promise<number> { return this.page.locator('[data-diagram-viewport]').evaluate(node => node.scrollLeft); }
  scrollTop(): Promise<number> { return this.page.locator('[data-diagram-viewport]').evaluate(node => node.scrollTop); }
  async dispose(): Promise<void> { await this.page.evaluate(() => window.outputTabs.dispose()); }
  async hostExists(): Promise<boolean> { return await this.page.locator('#output-host').count() === 1; }
}

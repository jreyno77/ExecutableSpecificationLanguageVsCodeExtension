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
  const session = inject('outputTabs');
  if (session) {
    shared = import('playwright').then(({ chromium }) => chromium.connect(session.browserEndpoint, { timeout: 10_000 }));
    await shared;
  }
});
afterAll(async () => { await (await shared?.catch(() => undefined))?.close(); });

export class OutputTabsBrowser {
  private readonly requests: string[] = [];
  private constructor(readonly page: Page) {
    page.on('request', request => this.requests.push(request.url()));
  }
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
  async showSource(): Promise<void> { await this.page.getByRole('button', { name: 'Show source', exact: true }).click(); }
  async followLink(label: string): Promise<void> { await this.page.getByRole('link', { name: label, exact: true }).click(); }
  markdownHeadings(): Promise<string[]> { return this.page.locator('[data-output-content] :is(h1,h2,h3,h4,h5,h6)').allTextContents(); }
  markdownListItems(): Promise<string[]> { return this.page.locator('[data-output-content] li').allTextContents(); }
  markdownTableRows(): Promise<string[][]> {
    return this.page.locator('[data-output-content] tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent ?? '')));
  }
  markdownCodeBlocks(): Promise<string[]> { return this.page.locator('[data-output-content] pre code').allTextContents(); }
  markdownAnchorInView(anchor: string): Promise<boolean> {
    return this.page.evaluate(id => {
      const target = document.querySelector('[data-output-content] #' + CSS.escape(id));
      const rect = target?.getBoundingClientRect();
      return rect !== undefined && rect.top >= 0 && rect.top < window.innerHeight;
    }, anchor);
  }
  documentContainsText(text: string): Promise<boolean> { return this.page.getByRole('tabpanel').textContent().then(value => value?.includes(text) ?? false); }
  inactiveDocumentLinks(): Promise<string[]> { return this.page.locator('[role="tabpanel"] [role="link"][aria-disabled="true"]').allTextContents(); }
  async hasUnsafeContent(): Promise<boolean> {
    const elements = await this.page.locator('[role="tabpanel"] script, [role="tabpanel"] iframe, [role="tabpanel"] object, [role="tabpanel"] embed, [role="tabpanel"] img:not([data-diagram-image]), [role="tabpanel"] [onerror], [role="tabpanel"] [onload]').count();
    return elements > 0 || await this.page.evaluate(() => 'expecPreviewUnsafe' in window);
  }
  async resourceRequests(): Promise<string[]> { return [...this.requests]; }

  private async promiseButton(label: string) {
    const selector = await this.page.evaluate(label => 'button[data-promise-label="' + CSS.escape(label) + '"]', label);
    return this.page.locator(selector);
  }
  async hoverPromise(label: string): Promise<void> { await (await this.promiseButton(label)).hover(); }
  async focusPromise(label: string): Promise<void> { await (await this.promiseButton(label)).focus(); }
  async pinPromise(label: string): Promise<void> { await (await this.promiseButton(label)).click(); }
  async pressPromiseKey(key: string): Promise<void> { await this.page.keyboard.press(key); }
  async hoverPromiseBubble(): Promise<void> { await this.page.locator('[data-promise-bubble]').hover(); }
  async leavePromises(): Promise<void> {
    await this.page.mouse.move(4, 4);
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }
  async clickOutsidePromises(): Promise<void> { await this.page.mouse.click(4, 4); }
  async promiseIndicatorLabels(): Promise<string[]> {
    if (await this.page.locator('img[data-diagram-image]').count()) await this.imageLoaded();
    return this.page.locator('button[data-promise-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') ?? ''));
  }
  private async promiseBubble() {
    const bubble = this.page.locator('[data-promise-bubble]'), count = await bubble.count();
    if (count > 1) throw new Error('More than one promise bubble is visible.');
    return count ? bubble : undefined;
  }
  async visiblePromiseLabel(): Promise<string> { return await (await this.promiseBubble())?.getAttribute('data-promise-label') ?? ''; }
  async visiblePromiseTexts(): Promise<string[]> { return await (await this.promiseBubble())?.locator('[data-promise-text]').allTextContents() ?? []; }
  async pinnedPromiseLabel(): Promise<string> {
    const bubble = await this.promiseBubble();
    return await bubble?.getAttribute('data-promise-pinned') === 'true' ? await bubble!.getAttribute('data-promise-label') ?? '' : '';
  }
  async promiseIndicatorAligned(label: string): Promise<boolean> {
    if (!await this.imageLoaded()) return false;
    return this.page.evaluate(label => {
      const image = document.querySelector<HTMLImageElement>('img[data-diagram-image]');
      const control = document.querySelector<HTMLElement>('button[data-promise-label="' + CSS.escape(label) + '"]');
      const highlight = document.querySelector<HTMLElement>('[data-promise-row="' + CSS.escape(label) + '"]');
      if (!image || !control || !highlight) return false;
      const source = new DOMParser().parseFromString(atob(image.src.split(',', 2)[1]!), 'image/svg+xml');
      const svg = source.documentElement as unknown as SVGSVGElement;
      const text = [...source.querySelectorAll('text')].find(node => node.textContent === label.split('.').at(-1) + '()');
      if (!text) return false;
      const tx = Number(text.getAttribute('x')), ty = Number(text.getAttribute('y'));
      const row = [...source.querySelectorAll('rect')].find(node => {
        const x = Number(node.getAttribute('x') ?? 0), y = Number(node.getAttribute('y') ?? 0);
        return x <= tx && tx <= x + Number(node.getAttribute('width')) && y <= ty && ty <= y + Number(node.getAttribute('height'));
      });
      if (!row) return false;
      const surface = svg.viewBox.baseVal, displayed = image.getBoundingClientRect(), actual = highlight.getBoundingClientRect();
      const expected = {
        x: displayed.x + (Number(row.getAttribute('x') ?? 0) - surface.x) * displayed.width / surface.width,
        y: displayed.y + (Number(row.getAttribute('y') ?? 0) - surface.y) * displayed.height / surface.height,
        width: Number(row.getAttribute('width')) * displayed.width / surface.width,
        height: Number(row.getAttribute('height')) * displayed.height / surface.height,
      };
      const button = control.getBoundingClientRect();
      return Object.entries(expected).every(([key, value]) => Math.abs(actual[key as keyof typeof expected] - value) < 1)
        && button.height > 0 && button.y >= actual.y - 1 && button.bottom <= actual.bottom + 1;
    }, label);
  }

}

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
    const context = await browser.newContext();
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
    const selector = await this.page.evaluate(id => '[data-output-id="' + CSS.escape(id) + '"]', id);
    await this.page.locator(selector).click();
  }
  labels(): Promise<string[]> { return this.page.getByRole('tab').allTextContents(); }
  content(): Promise<string> { return this.page.getByRole('tabpanel').innerText(); }
  async dispose(): Promise<void> { await this.page.evaluate(() => window.outputTabs.dispose()); }
  async hostExists(): Promise<boolean> { return await this.page.locator('#output-host').count() === 1; }
}

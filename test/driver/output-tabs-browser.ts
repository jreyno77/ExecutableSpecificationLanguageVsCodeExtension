import { afterAll, onTestFinished } from 'vitest';
import type { Browser, Page } from 'playwright';
import type { ViteDevServer } from 'vite';
import type { OutputTabs } from '../../src/ui/OutputTabs.js';
import type { OutputTab } from '../../src/core/OutputTab.js';

declare global {
  interface Window { outputTabs: OutputTabs; createOutputTabs(hostElementId?: string): void }
}
let shared: Promise<{ browser: Browser; server: ViteDevServer; url: string }> | undefined;
async function start() {
  const [{ createServer }, { chromium }, { default: react }] = await Promise.all([
    import('vite'), import('playwright'), import('@vitejs/plugin-react'),
  ]);
  const server = await createServer({ configFile: false, plugins: [react()],
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser: Browser | undefined;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    return { browser, server, url: server.resolvedUrls!.local[0]! };
  } catch (error) {
    try { await browser?.close(); } finally { await server.close(); }
    throw error;
  }
}
afterAll(async () => {
  const session = await shared?.catch(() => undefined);
  if (session) try { await session.browser.close(); } finally { await session.server.close(); }
});

export class OutputTabsBrowser {
  private constructor(readonly page: Page) {}
  static async open(): Promise<OutputTabsBrowser> {
    const session = await (shared ??= start());
    const context = await session.browser.newContext();
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

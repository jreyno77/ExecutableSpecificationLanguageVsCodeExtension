import type { TestProject } from 'vitest/node';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, type Browser, type BrowserServer } from 'playwright';

declare module 'vitest' {
  interface ProvidedContext { outputTabs: { url: string; browserEndpoint: string } }
}

/** Complete the real fixture's module graph before any mutable test case starts. */
export async function prepareOutputTabs(browser: Browser, url: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const failures: unknown[] = [];
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(url + 'test/resources/output-tabs.html');
    await page.waitForFunction(() => typeof window.createOutputTabs === 'function');
  } catch (error) { failures.push(error); }
  try { await context.close(); }
  catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Output tabs fixture preparation and cleanup failed.');
}

async function closeSetup(server: ViteDevServer, browserServer?: BrowserServer, connection?: Browser): Promise<unknown[]> {
  const outcomes = await Promise.allSettled([connection?.close(), browserServer?.close(), server.close()]);
  return outcomes.flatMap(outcome => outcome.status === 'rejected' ? [outcome.reason] : []);
}

export async function setup(project: TestProject) {
  const server = await createServer({ configFile: false, plugins: [react()],
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    optimizeDeps: { entries: ['test/resources/output-tabs.html'] } });
  let browserServer: BrowserServer | undefined;
  let connection: Browser | undefined;
  try {
    await server.listen();
    browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1' });
    connection = await chromium.connect(browserServer.wsEndpoint(), { timeout: 30_000 });
    const url = server.resolvedUrls!.local[0]!;
    await prepareOutputTabs(connection, url);
    await connection.close();
    connection = undefined;
    project.provide('outputTabs', { url, browserEndpoint: browserServer.wsEndpoint() });
    return async () => {
      const failures = await closeSetup(server, browserServer);
      if (failures.length) throw new AggregateError(failures, 'Output tabs suite cleanup failed.');
    };
  } catch (error) {
    const failures = await closeSetup(server, browserServer, connection);
    if (failures.length) throw new AggregateError([error, ...failures], 'Output tabs suite preparation and cleanup failed.');
    throw error;
  }
}

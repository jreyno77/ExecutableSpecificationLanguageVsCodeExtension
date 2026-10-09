import { chromium } from 'playwright';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext { svgBrowserEndpoint?: string }
}

/** Prepare one browser; each observation still owns its isolated context. */
export async function setup(project: TestProject) {
  const server = await chromium.launchServer({ headless: true, host: '127.0.0.1' });
  try {
    project.provide('svgBrowserEndpoint', server.wsEndpoint());
    return () => server.close();
  } catch (error) {
    try { await server.close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'SVG browser preparation and cleanup failed.'); }
    throw error;
  }
}
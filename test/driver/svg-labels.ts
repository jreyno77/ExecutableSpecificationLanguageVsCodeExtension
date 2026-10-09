import { afterAll, inject } from 'vitest';
import type { Browser, Page } from 'playwright';

let browser: Promise<Browser> | undefined;
afterAll(async () => { await (await browser?.catch(() => undefined))?.close(); });

/** Reuse the immutable browser process; callers own and close their isolated contexts. */
export function svgBrowser(): Promise<Browser> {
  return browser ??= import('playwright').then(({ chromium }) => {
    const endpoint = inject('svgBrowserEndpoint');
    return endpoint ? chromium.connect(endpoint, { timeout: 10_000 }) : chromium.launch({ headless: true });
  });
}

/** Parse actual output as detached XML, without inserting it or executing SVG content. */
export function svgTextLabels(page: Page, svg: string): Promise<readonly string[]> {
  return page.evaluate(content => {
    const actual = new DOMParser().parseFromString(content, 'image/svg+xml');
    if (actual.querySelector('parsererror')) throw new Error('The actual output SVG is malformed.');
    return Array.from(actual.querySelectorAll('text, tspan')).map(node => node.textContent ?? '');
  }, svg);
}

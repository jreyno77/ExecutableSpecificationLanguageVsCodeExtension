import { test, expect } from 'vitest';
import { OutputTabsBrowser } from '../../driver/output-tabs-browser.js';
import type { OutputTab } from '../../../src/core/OutputTab.js';

const text = (content: string, mediaType = 'text/markdown'): OutputTab[] => [{
  id: 'notes', label: 'Notes', status: 'ready', documents: [{ path: 'Notes.md', mediaType, content }],
}];
const diagram = (content: string): OutputTab[] => [{
  id: 'uml', label: 'UML', status: 'ready', documents: [{ path: 'structure.svg', mediaType: 'image/svg+xml', content }],
}];
const wide = '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><text x="20" y="40">Book</text></svg>';

test('text documents remain literal instead of inserting markup', async () => {
  const view = await OutputTabsBrowser.open();
  const authored = '# <img src="https://external.invalid/book.png" onerror="alert(1)">';
  await view.present(text(authored));
  expect(await view.content()).toBe(authored);
  expect(await view.page.locator('[role="tabpanel"] img').count()).toBe(0);
});

test('unsupported media retains its path and type with a readable explanation', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(text('archive bytes', 'application/zip'));
  expect(await view.documentPath()).toBe('Notes.md');
  expect(await view.page.getByRole('tabpanel').getAttribute('data-media-type')).toBe('application/zip');
  expect(await view.explanation()).toContain('application/zip');
  expect(await view.explanation()).toContain('Notes.md');
  expect(await view.content()).toBe('');
});

test('blocked feedback withdraws documents even if the caller retains an old payload', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(text('# Book'));
  await view.present([{ ...text('# Stale Book')[0]!, status: 'blocked', message: 'Source has an error.' }]);
  expect(await view.status()).toBe('blocked');
  expect(await view.explanation()).toBe('Source has an error.');
  expect(await view.documentPaths()).toEqual([]);
  expect(await view.content()).toBe('');
});

test('UTF-8 SVG renders as an inert image without executing or fetching its embedded content', async () => {
  const view = await OutputTabsBrowser.open(), external: string[] = [];
  view.page.on('request', request => { if (request.url().startsWith('https://external.invalid/')) external.push(request.url()); });
  await view.present(diagram('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><text x="20" y="40">Bibliothèque 📚</text><script>window.injected=true</script><image href="https://external.invalid/book.png" width="20" height="20"/></svg>'));
  expect(await view.imageLoaded()).toBe(true);
  expect(await view.displayedWidth()).toBe(600);
  expect(await view.page.locator('img[data-diagram-image]').getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
  const actualLabel = await view.page.locator('img[data-diagram-image]').evaluate(image => {
    const encoded = image.getAttribute('src')!.split(',')[1]!;
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const svg = new DOMParser().parseFromString(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 'image/svg+xml');
    return svg.querySelector('text')?.textContent;
  });
  expect(actualLabel).toBe('Bibliothèque 📚');
  expect(await view.page.locator('[role="tabpanel"] svg, [role="tabpanel"] script').count()).toBe(0);
  expect(await view.page.evaluate(() => (window as unknown as { injected?: boolean }).injected)).toBeUndefined();
  expect(external).toEqual([]);
});

test('the native author can zoom to 125 percent and reset to natural size', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram(wide));
  expect(await view.imageLoaded()).toBe(true);
  await view.setZoom(125);
  expect(await view.zoom()).toBe(125);
  expect(await view.displayedWidth()).toBe(2250);
  await view.resetZoom();
  expect(await view.zoom()).toBe(100);
  expect(await view.displayedWidth()).toBe(1800);
});

test('a replaced image releases its source and late events cannot change the current diagram', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram(wide));
  expect(await view.imageLoaded()).toBe(true);
  const old = await view.page.locator('img[data-diagram-image]').elementHandle();
  expect(old).not.toBeNull();
  await view.present(diagram('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><text x="20" y="40">Novel</text></svg>'));
  expect(await view.imageLoaded()).toBe(true);
  expect(await old!.evaluate(node => ({ connected: node.isConnected, source: node.getAttribute('src') }))).toEqual({ connected: false, source: null });
  await old!.evaluate(node => { node.dispatchEvent(new Event('error')); node.dispatchEvent(new Event('load')); });
  expect(await view.imageLoaded()).toBe(true);
  expect(await view.displayedWidth()).toBe(700);
  expect(await view.explanation()).toBe('');
});

test('an unreadable SVG reports its actual path and a later valid image clears the error', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram('<svg not-valid'));
  expect(await view.imageLoaded()).toBe(false);
  await expect.poll(() => view.explanation()).toContain('structure.svg');
  await view.present(diagram(wide));
  expect(await view.imageLoaded()).toBe(true);
  expect(await view.explanation()).toBe('');
});

test('disposing releases the displayed image and late events leave the host empty', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram(wide));
  expect(await view.imageLoaded()).toBe(true);
  const image = await view.page.locator('img[data-diagram-image]').elementHandle();
  expect(image).not.toBeNull();
  await view.dispose();
  expect(await image!.evaluate(node => ({ connected: node.isConnected, source: node.getAttribute('src') }))).toEqual({ connected: false, source: null });
  await image!.evaluate(node => node.dispatchEvent(new Event('error')));
  expect(await view.hostExists()).toBe(true);
  expect(await view.page.locator('#output-host').innerHTML()).toBe('');
});


test('a dimensionless SVG keeps its authored viewBox scale while zooming and scrolling', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7654 599"><text x="20" y="40">Book</text></svg>'));
  expect(await view.imageLoaded()).toBe(true);
  expect(await view.displayedWidth()).toBe(7654);
  await view.setZoom(125);
  expect(await view.zoom()).toBe(125);
  expect(await view.displayedWidth()).toBeGreaterThan(7654);
  await view.scrollDiagram(420, 180);
  expect(await view.scrollLeft()).toBeGreaterThan(0);
  expect(await view.scrollTop()).toBeGreaterThan(0);
  await view.resetZoom();
  expect(await view.zoom()).toBe(100);
  expect(await view.displayedWidth()).toBe(7654);
});

test('explicit SVG dimensions retain their size instead of the viewBox extent', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 1800 1200"><text x="20" y="40">Book</text></svg>'));
  expect(await view.imageLoaded()).toBe(true);
  expect(await view.displayedWidth()).toBe(600);
  await view.setZoom(125);
  expect(await view.displayedWidth()).toBe(750);
  await view.resetZoom();
  expect(await view.displayedWidth()).toBe(600);
});

test('a nonpositive SVG viewBox does not become a logical image extent', async () => {
  const view = await OutputTabsBrowser.open();
  await view.present(diagram('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 1200"><text x="20" y="40">Book</text></svg>'));
  expect(await view.imageLoaded()).toBe(true);
  expect(await view.displayedWidth()).toBe(300);
});

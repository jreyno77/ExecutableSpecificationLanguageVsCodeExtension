import { test, expect } from 'vitest';
import { OutputTabsBrowser } from '../../driver/output-tabs-browser.js';

test('a missing mount target reports a clear error', async () => {
  const view = await OutputTabsBrowser.open();
  await expect(view.construct('missing-host')).rejects.toThrow('existing empty host: missing-host');
});

test('mounting refuses to replace content owned by the host', async () => {
  const view = await OutputTabsBrowser.open();
  await expect(view.construct('neighbor')).rejects.toThrow('existing empty host: neighbor');
  expect(await view.page.locator('#neighbor').innerText()).toBe('Connection settings');
});

test('a disposed view refuses further presentation', async () => {
  const view = await OutputTabsBrowser.open();
  await view.dispose();
  await expect(view.present([])).rejects.toThrow('OutputTabs has been disposed.');
});


test('an empty host already claimed by a view cannot be claimed twice', async () => {
  const view = await OutputTabsBrowser.open();
  await expect(view.construct('output-host')).rejects.toThrow('existing empty host: output-host');
  await view.present([{ id: 'uml', label: 'UML', status: 'ready', documents: [{ path: 'Book.d2', mediaType: 'text/vnd.d2', content: 'Book' }] }]);
  expect(await view.content()).toBe('Book');
});

test('disposing releases the host for another view', async () => {
  const view = await OutputTabsBrowser.open();
  await view.dispose();
  await view.construct('output-host');
  await view.present([{ id: 'markdown', label: 'Notes', status: 'ready', documents: [{ path: 'Book.md', mediaType: 'text/markdown', content: '# Book' }] }]);
  expect(await view.content()).toBe('# Book');
});

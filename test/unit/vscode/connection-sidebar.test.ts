import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionSidebar } from '../../../src/vscode/ConnectionSidebar.js';
import { RecordedSidebarHost, commands, Uri } from '../../resources/vscode/recorded-sidebar-api.js';

const shop = '{"formatVersion":1,"version":"0.1.0","project":{"root":"shop"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
const library = '{"formatVersion":1,"version":"0.1.0","project":{"root":"library"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
let host: RecordedSidebarHost | undefined;
let sidebar: ConnectionSidebar | undefined;
afterEach(async () => { try { sidebar?.dispose(); } finally { await host?.dispose(); sidebar = undefined; host = undefined; } });

async function startConnection() {
  host = await RecordedSidebarHost.create(shop);
  sidebar = new ConnectionSidebar(host.context);
  sidebar.start(host.file);
  return { host, sidebar };
}

async function expectConnectedProject(host: RecordedSidebarHost, name: string) {
  await vi.waitFor(async () => {
    const rows = await host.rows();
    expect(rows).toContainEqual(expect.objectContaining({ contextValue: 'connected', description: join(host.directory, name) }));
  });
}

describe('the native connection sidebar at its host boundary', () => {
  it('registers its actual native connection provider and choose command once', async () => {
    const { host, sidebar } = await startConnection();
    sidebar.start(host.file);
    expect(host.providers.get('expec.connection')).toBe(sidebar);
    expect(host.registrations.filter(resource => resource.name === 'view:expec.connection')).toHaveLength(1);
    expect(host.registrations.filter(resource => resource.name === 'command:expec.chooseProject')).toHaveLength(1);
  });

  it('an old save request cannot overwrite newer saved configuration', async () => {
    const { host, sidebar } = await startConnection();
    const previous = await host.captureSavedConfiguration();
    await host.replaceSavedConfiguration(library);
    await expectConnectedProject(host, 'library');

    sidebar.saveConfiguration(previous, shop);
    await host.settleRequestedSave();

    expect(await host.savedConfiguration()).toBe(library);
    expect(host.writes).toEqual([]);
    await expectConnectedProject(host, 'library');
  });

  it('a captured save cannot overwrite configuration text edited without saving', async () => {
    const { host, sidebar } = await startConnection();
    await expectConnectedProject(host, 'shop');
    const previous = await host.captureSavedConfiguration();
    await host.editWithoutSaving(library);

    sidebar.saveConfiguration(previous, library);
    await host.settleRequestedSave();

    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.documents[0]!.getText()).toBe(library);
    expect(host.documents[0]!.isDirty).toBe(true);
    expect(host.writes).toEqual([]);
  });

  it('disposing the sidebar releases its native registrations and watches and prevents later saves', async () => {
    const { host, sidebar } = await startConnection();
    await expectConnectedProject(host, 'shop');
    const previous = await host.captureSavedConfiguration();

    sidebar.dispose();
    sidebar.saveConfiguration(previous, library);
    await host.settleRequestedSave();

    expect(host.registrations.every(resource => resource.disposed)).toBe(true);
    expect(host.watchers.length).toBeGreaterThan(0);
    expect(host.watchers.every(watcher => watcher.disposed)).toBe(true);
    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.writes).toEqual([]);
  });
  it('finishing native watch registration does not discard a project choice before its save', async () => {
    const { host } = await startConnection();
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const watch = host.holdNextStat(host.directory);
    const save = host.holdNextRead(host.file);
    try {
      await commands.executeCommand('expec.chooseProject', Uri.file(join(host.directory, 'library')));
      await Promise.all([watch.started, save.started]);
      watch.release();
      await host.settleRequestedSave([save]);
      save.release();
      await host.settleRequestedSave();

      expect(JSON.parse(await host.savedConfiguration()).project.root).toBe(join(host.directory, 'library'));
      await expectConnectedProject(host, 'library');
    } finally { watch.release(); save.release(); }
  });

  it('obsolete watch setup cannot reread a newly selected manifest', async () => {
    host = await RecordedSidebarHost.create(shop);
    sidebar = new ConnectionSidebar(host.context);
    const oldWatch = host.holdNextStat(host.directory);
    try {
      sidebar.start(host.file);
      await oldWatch.started;
      const selected = await host.addConfiguration('selected.json', library);
      sidebar.start(selected);
      await expectConnectedProject(host, 'library');
      await host.settleRequestedSave([oldWatch]);
      const readsBeforeOldCompletion = host.reads.filter(file => file === selected).length;

      oldWatch.release();
      await host.settleRequestedSave();

      expect(host.reads.filter(file => file === selected)).toHaveLength(readsBeforeOldCompletion);
      await expectConnectedProject(host, 'library');
      expect(host.writes).toEqual([]);
    } finally { oldWatch.release(); }
  });
  it('restoring a nested target during new parent watch setup recovers without another event', async () => {
    const nested = '{"formatVersion":1,"version":"0.1.0","project":{"root":"nested/shop"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
    host = await RecordedSidebarHost.create(nested);
    sidebar = new ConnectionSidebar(host.context);
    sidebar.start(host.file);
    const target = join(host.directory, 'nested', 'shop');
    const expectUnavailable = () => vi.waitFor(async () => {
      expect(await host!.rows()).toContainEqual(expect.objectContaining({ contextValue: 'unavailable', description: target }));
    });
    await expectUnavailable();
    await host.settleRequestedSave();
    await expectUnavailable();
    const watch = host.holdNextStat(join(host.directory, 'nested'));
    try {
      await host.restoreDirectory('nested');
      await watch.started;
      await expectUnavailable();
      await host.restoreDirectory('nested/shop');
      watch.release();
      await host.settleRequestedSave();

      await expectConnectedProject(host, join('nested', 'shop'));
      expect(host.writes).toEqual([]);
      expect(await host.savedConfiguration()).toBe(nested);
    } finally { watch.release(); }
  });
});

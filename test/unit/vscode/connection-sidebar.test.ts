import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionSidebar } from '../../../src/vscode/ConnectionSidebar.js';
import type { ConnectionConfiguration } from '../../../src/core/ConnectionConfiguration.js';
import { RecordedSidebarHost, commands, Uri, workspace, EventEmitter } from '../../resources/vscode/recorded-sidebar-api.js';

const shop = '{"formatVersion":1,"version":"0.1.0","project":{"root":"shop"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
const library = '{"formatVersion":1,"version":"0.1.0","project":{"root":"library"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
let host: RecordedSidebarHost | undefined;
let sidebar: ConnectionSidebar | undefined;
afterEach(async () => { try { sidebar?.dispose(); } finally { await host?.dispose(); sidebar = undefined; host = undefined; } });

function recordPreviewConfigurations(receive?: (configuration: ConnectionConfiguration | undefined) => void) {
  const configurations: Array<ConnectionConfiguration | undefined> = [];
  return { configurations, feedback: {
    configurationChanged(configuration: ConnectionConfiguration | undefined) { configurations.push(configuration); receive?.(configuration); },
  } };
}

async function startConnection() {
  host = await RecordedSidebarHost.create(shop);
  const previews = recordPreviewConfigurations();
  sidebar = new ConnectionSidebar(host.context, previews.feedback);
  sidebar.start(host.file);
  return { host, sidebar, previews };
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
    sidebar = new ConnectionSidebar(host.context, recordPreviewConfigurations().feedback);
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
    sidebar = new ConnectionSidebar(host.context, recordPreviewConfigurations().feedback);
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
  it('previews receive the saved configuration even when its target is unavailable', async () => {
    const missing = '{"formatVersion":1,"version":"0.1.0","project":{"root":"missing-shop"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
    host = await RecordedSidebarHost.create(missing);
    const previews = recordPreviewConfigurations();
    sidebar = new ConnectionSidebar(host.context, previews.feedback);
    sidebar.start(host.file);
    await vi.waitFor(async () => {
      expect(await host!.rows()).toContainEqual(expect.objectContaining({ contextValue: 'unavailable', description: join(host!.directory, 'missing-shop') }));
    });
    await host.settleRequestedSave();

    expect(previews.configurations.at(-1)).toEqual({ file: host.file, text: missing, writable: true });
    expect(Object.isFrozen(previews.configurations.at(-1))).toBe(true);
    expect(host.writes).toEqual([]);
  });

  it('dirty configuration edits keep the actual saved bytes in preview feedback', async () => {
    const { host, previews } = await startConnection();
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();

    await host.editWithoutSaving(library);
    await host.settleRequestedSave();

    expect(previews.configurations.at(-1)).toEqual({ file: host.file, text: shop, writable: false });
    expect(previews.configurations.some(configuration => configuration?.text === library)).toBe(false);
    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.documents[0]!.getText()).toBe(library);
    expect(host.documents[0]!.isDirty).toBe(true);
    expect(host.writes).toEqual([]);
  });

  it('a successful native save forwards the actual confirmed configuration to previews', async () => {
    const { host, sidebar, previews } = await startConnection();
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const previous = await host.captureSavedConfiguration();

    sidebar.saveConfiguration(previous, library);
    await host.settleRequestedSave();
    await expectConnectedProject(host, 'library');

    expect(previews.configurations.at(-1)).toEqual({ file: host.file, text: library, writable: true });
    expect(await host.savedConfiguration()).toBe(library);
    expect(Object.isFrozen(previews.configurations.at(-1))).toBe(true);
  });

  it('switching manifests withdraws the old preview selection and discards its pending read', async () => {
    const { host, sidebar, previews } = await startConnection();
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const oldRead = host.holdNextRead(host.file);
    const selected = await host.addConfiguration('selected.json', library);
    const selectedRead = host.holdNextRead(selected);
    try {
      await host.replaceSavedConfiguration(library);
      await oldRead.started;
      const beforeSwitch = previews.configurations.length;

      sidebar.start(selected);
      await selectedRead.started;

      expect(previews.configurations.slice(beforeSwitch)).toEqual([undefined]);
      selectedRead.release();
      await host.settleRequestedSave([oldRead]);
      await expectConnectedProject(host, 'library');
      expect(previews.configurations.at(-1)).toEqual({ file: selected, text: library, writable: true });
      const selectedPublications = previews.configurations.length;
      oldRead.release();
      await host.settleRequestedSave();
      expect(previews.configurations).toHaveLength(selectedPublications);
      expect(previews.configurations.at(-1)?.file).toBe(selected);
      expect(host.writes).toEqual([]);
    } finally { oldRead.release(); selectedRead.release(); }
  });

  it('disposal withdraws preview configuration once and prevents pending reads from republishing', async () => {
    const { host, sidebar, previews } = await startConnection();
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const read = host.holdNextRead(host.file);
    try {
      await host.replaceSavedConfiguration(library);
      await read.started;
      const beforeDisposal = previews.configurations.length;

      sidebar.dispose();
      sidebar.dispose();

      expect(previews.configurations.slice(beforeDisposal)).toEqual([undefined]);
      read.release();
      await host.settleRequestedSave();
      expect(previews.configurations.slice(beforeDisposal)).toEqual([undefined]);
      expect(host.registrations.every(resource => resource.disposed)).toBe(true);
      expect(host.writes).toEqual([]);
    } finally { read.release(); }
  });

  it('disposal during preview withdrawal stops the manifest switch before creating another native lifetime', async () => {
    host = await RecordedSidebarHost.create(shop);
    let withdrawn = false;
    const previews = recordPreviewConfigurations(configuration => {
      if (configuration === undefined && !withdrawn) { withdrawn = true; sidebar!.dispose(); }
    });
    sidebar = new ConnectionSidebar(host.context, previews.feedback);
    sidebar.start(host.file);
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const selected = await host.addConfiguration('selected.json', library);
    const publications = vi.spyOn(EventEmitter.prototype, 'fire');
    try {
      sidebar.start(selected);
      await host.settleRequestedSave();

      expect(publications).not.toHaveBeenCalled();
      expect(sidebar.getChildren()).toEqual([]);
      expect(host.reads).not.toContain(selected);
      expect(host.registrations.every(resource => resource.disposed)).toBe(true);
      expect(host.watchers.every(watcher => watcher.disposed)).toBe(true);
      expect(host.writes).toEqual([]);
    } finally { publications.mockRestore(); }
  });

  it('a newer manifest selected during preview withdrawal remains the current saved selection', async () => {
    host = await RecordedSidebarHost.create(shop);
    const superseded = await host.addConfiguration('superseded.json', shop);
    const selected = await host.addConfiguration('selected.json', library);
    let redirected = false;
    const previews = recordPreviewConfigurations(configuration => {
      if (configuration === undefined && !redirected) { redirected = true; sidebar!.start(selected); }
    });
    sidebar = new ConnectionSidebar(host.context, previews.feedback);
    sidebar.start(host.file);
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();

    sidebar.start(superseded);
    await host.settleRequestedSave();

    await expectConnectedProject(host, 'library');
    expect(previews.configurations.at(-1)).toEqual({ file: selected, text: library, writable: true });
    expect(host.reads).not.toContain(superseded);
    expect(host.writes).toEqual([]);
  });

  it('workspace removal cannot discard a newer manifest selected by preview withdrawal', async () => {
    host = await RecordedSidebarHost.create(shop);
    const selected = await host.addConfiguration('selected.json', library);
    let redirected = false;
    const previews = recordPreviewConfigurations(configuration => {
      if (configuration === undefined && !redirected) { redirected = true; sidebar!.start(selected); }
    });
    sidebar = new ConnectionSidebar(host.context, previews.feedback);
    sidebar.start(host.file);
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const folders = vi.spyOn(workspace, 'workspaceFolders', 'get').mockReturnValue([]);
    try {
      host.foldersChanged.fire({ removed: [{ uri: Uri.file(host.directory) }], added: [] });
      await host.settleRequestedSave();

      await expectConnectedProject(host, 'library');
      expect(previews.configurations.at(-1)).toEqual({ file: selected, text: library, writable: true });
      expect(host.writes).toEqual([]);
    } finally { folders.mockRestore(); }
  });

  it('a failed preview withdrawal still releases the previous manifest watches', async () => {
    host = await RecordedSidebarHost.create(shop);
    let withdrawn = false;
    const previews = recordPreviewConfigurations(configuration => {
      if (configuration === undefined && !withdrawn) { withdrawn = true; throw new Error('Preview withdrawal failed.'); }
    });
    sidebar = new ConnectionSidebar(host.context, previews.feedback);
    sidebar.start(host.file);
    await expectConnectedProject(host, 'shop');
    await host.settleRequestedSave();
    const previousWatches = [...host.watchers];
    const selected = await host.addConfiguration('selected.json', library);

    expect(() => sidebar!.start(selected)).toThrow();
    await host.settleRequestedSave();

    expect(previousWatches.length).toBeGreaterThan(0);
    expect(previousWatches.every(watcher => watcher.disposed)).toBe(true);
    expect(sidebar.getChildren()).not.toContainEqual(expect.objectContaining({ status: 'connected' }));
    expect(host.reads).not.toContain(selected);
    expect(host.writes).toEqual([]);
  });

});

import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionSidebar } from '../../../src/vscode/ConnectionSidebar.js';
import type { ConnectionConfiguration } from '../../../src/core/ConnectionConfiguration.js';
import { RecordedSidebarHost, commands, Uri, window, workspace } from '../../resources/vscode/recorded-sidebar-api.js';

const shop = '{"formatVersion":1,"version":"0.1.0","project":{"root":"shop"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
const library = '{"formatVersion":1,"version":"0.1.0","project":{"root":"library"},"build":{"entries":["src/main.expec"]},"outputs":[]}';
let host: RecordedSidebarHost | undefined;
let sidebar: ConnectionSidebar | undefined;
afterEach(async () => { vi.restoreAllMocks(); try { sidebar?.dispose(); } finally { await host?.dispose(); sidebar = undefined; host = undefined; } });
async function connected(name = 'shop') {
  await vi.waitFor(async () => expect(await host!.rows()).toContainEqual(expect.objectContaining({ contextValue: 'connected', description: join(host!.directory, name) })));
}
async function start() {
  host = await RecordedSidebarHost.create(shop);
  const previews: Array<ConnectionConfiguration | undefined> = [];
  sidebar = new ConnectionSidebar(host.context, { configurationChanged(configuration) { previews.push(configuration); } });
  sidebar.start(host.file); await connected(); await host.settleRequestedSave();
  return { host, sidebar, previews };
}
function heldAnswer<T>() {
  let release!: (answer: T) => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const promise = new Promise<T>(resolve => { release = resolve; });
  return { started, release, answer() { entered(); return promise; } };
}
function chooseNewOutput(host: RecordedSidebarHost) {
  host.picker = [Uri.file(join(host.directory, 'library'))]; host.selectedOutputs = ['markdown'];
}

describe('connection commands while ordinary native choices are pending', () => {
  it('Edit opens the selected dirty manifest without saving or replacing its text', async () => {
    const { host } = await start();
    await host.editWithoutSaving(library); await host.settleRequestedSave();
    await commands.executeCommand('expec.editConnection');
    expect(host.activeTextEditor?.document.uri.fsPath).toBe(host.file);
    expect(host.activeTextEditor?.document.getText()).toBe(library);
    expect(host.activeTextEditor?.document.isDirty).toBe(true);
    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.writes).toEqual([]);
  });
  it('Edit explains a missing selected manifest without creating it', async () => {
    const { host } = await start();
    await rm(host.file);
    await commands.executeCommand('expec.editConnection');
    expect(host.messages).toContainEqual(expect.objectContaining({ kind: 'information', text: expect.stringContaining('New Connection can create it') }));
    await expect(readFile(host.file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(host.writes).toEqual([]);
  });
  it('new saved metadata invalidates a pending output destination before any proposal is written', async () => {
    const { host } = await start(); chooseNewOutput(host);
    const destination = heldAnswer<string | undefined>();
    vi.spyOn(window, 'showInputBox').mockImplementation(() => destination.answer());
    const command = commands.executeCommand('expec.newConnection');
    try {
      await destination.started;
      await host.replaceSavedConfiguration(library); await connected('library'); await host.settleRequestedSave();
      destination.release('docs'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(library);
      expect(host.writes).toEqual([]);
      await connected('library');
    } finally { destination.release(undefined); await command; }
  });
  it('a dirty edit made during the output prompt retains saved bytes and the unsaved document', async () => {
    const { host } = await start(); chooseNewOutput(host);
    const destination = heldAnswer<string | undefined>();
    vi.spyOn(window, 'showInputBox').mockImplementation(() => destination.answer());
    const command = commands.executeCommand('expec.newConnection');
    try {
      await destination.started;
      await host.editWithoutSaving(library); await host.settleRequestedSave();
      destination.release('docs'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.documents[0]!.getText()).toBe(library);
      expect(host.documents[0]!.isDirty).toBe(true);
      expect(host.writes).toEqual([]);
      await connected('shop');
    } finally { destination.release(undefined); await command; }
  });
  it('selecting another manifest during the output prompt cannot write either old or new metadata', async () => {
    const { host, sidebar } = await start(); chooseNewOutput(host);
    const selected = await host.addConfiguration('selected.json', library), destination = heldAnswer<string | undefined>();
    vi.spyOn(window, 'showInputBox').mockImplementation(() => destination.answer());
    const command = commands.executeCommand('expec.newConnection');
    try {
      await destination.started;
      sidebar.start(selected); await connected('library'); await host.settleRequestedSave();
      destination.release('docs'); await command; await host.settleRequestedSave();
      expect(await readFile(selected, 'utf8')).toBe(library);
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
      await connected('library');
    } finally { destination.release(undefined); await command; }
  });
  it('disposing during the destination prompt releases resources and prevents a late manifest write', async () => {
    const { host, sidebar } = await start(); chooseNewOutput(host);
    const destination = heldAnswer<string | undefined>();
    vi.spyOn(window, 'showInputBox').mockImplementation(() => destination.answer());
    const command = commands.executeCommand('expec.newConnection');
    try {
      await destination.started; sidebar.dispose();
      destination.release('docs'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
      expect(host.registrations.every(resource => resource.disposed)).toBe(true);
      expect(host.watchers.every(watcher => watcher.disposed)).toBe(true);
    } finally { destination.release(undefined); await command; }
  });
  it('cancelling the actual output destination leaves the old connection and bytes intact', async () => {
    const { host } = await start(); chooseNewOutput(host); host.inputAnswers.push(undefined);
    await commands.executeCommand('expec.newConnection'); await host.settleRequestedSave();
    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.writes).toEqual([]);
    await connected('shop');
  });
  it('new saved metadata invalidates a pending Delete confirmation', async () => {
    const { host } = await start(), confirmation = heldAnswer<string | undefined>();
    vi.spyOn(window, 'showWarningMessage').mockImplementation(() => confirmation.answer());
    const command = commands.executeCommand('expec.deleteConnection');
    try {
      await confirmation.started;
      await host.replaceSavedConfiguration(library); await connected('library'); await host.settleRequestedSave();
      confirmation.release('Delete Connection'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(library);
      expect(host.writes).toEqual([]);
      await connected('library');
    } finally { confirmation.release(undefined); await command; }
  });
  it('Delete explains exactly which manifest loses project metadata and cancellation changes nothing', async () => {
    const { host } = await start(); host.confirmDeletion = false;
    await commands.executeCommand('expec.deleteConnection'); await host.settleRequestedSave();
    const confirmation = host.messages.find(message => message.kind === 'warning')?.text;
    expect(confirmation).toContain(host.file);
    expect(confirmation).toContain('Only project metadata');
    expect(confirmation).toContain('Target files, sources, output settings and packages will be retained');
    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.writes).toEqual([]);
    await connected('shop');
  });
});

describe('the native connection-owned work observer', () => {
  it('retains one observer through a manifest switch while previews keep their saved metadata', async () => {
    const { host, sidebar, previews } = await start();
    const work: Array<ConnectionConfiguration | undefined> = [];
    sidebar.observeWork({ configurationChanged(configuration) { work.push(configuration); } });
    expect(work.at(-1)).toEqual({ file: host.file, text: shop, writable: true });
    sidebar.disconnect();
    expect(work.at(-1)).toBeUndefined();
    expect(previews.at(-1)).toEqual({ file: host.file, text: shop, writable: true });
    const selected = await host.addConfiguration('selected.json', library);
    sidebar.start(selected); await connected('library'); await host.settleRequestedSave();
    expect(work.at(-1)).toEqual({ file: selected, text: library, writable: true });
    expect(previews.at(-1)).toEqual({ file: selected, text: library, writable: true });
    sidebar.dispose();
    expect(work.at(-1)).toBeUndefined();
  });
  it('reentrant replacement during withdrawal retains the newest observer and never installs the superseded one', async () => {
    const { host, sidebar } = await start();
    const oldest: Array<ConnectionConfiguration | undefined> = [], middle: Array<ConnectionConfiguration | undefined> = [], newest: Array<ConnectionConfiguration | undefined> = [];
    let replaced = false;
    sidebar.observeWork({ configurationChanged(configuration) {
      oldest.push(configuration);
      if (!configuration && !replaced) { replaced = true; sidebar.observeWork({ configurationChanged(value) { newest.push(value); } }); }
    } });
    sidebar.observeWork({ configurationChanged(configuration) { middle.push(configuration); } });
    expect(oldest).toEqual([{ file: host.file, text: shop, writable: true }, undefined]);
    expect(middle).toEqual([]);
    expect(newest.at(-1)).toEqual({ file: host.file, text: shop, writable: true });
    sidebar.disconnect();
    expect(newest.at(-1)).toBeUndefined();
    expect(middle).toEqual([]);
  });
  it('a failed observer withdrawal still releases all native resources and withdraws previews', async () => {
    const { host, sidebar, previews } = await start();
    sidebar.observeWork({ configurationChanged(configuration) { if (!configuration) throw new Error('Work withdrawal failed.'); } });
    expect(() => sidebar.dispose()).toThrow(AggregateError);
    expect(host.registrations.every(resource => resource.disposed)).toBe(true);
    expect(host.watchers.every(watcher => watcher.disposed)).toBe(true);
    expect(previews.at(-1)).toBeUndefined();
  });
});
describe('legacy and guided connection commands share the author intent', () => {
  it('an older Choose picker cannot overwrite a newer guided connection and saved output settings', async () => {
    const { host } = await start(); chooseNewOutput(host); host.inputAnswers.push('docs');
    const oldFolder = heldAnswer<Uri[] | undefined>();
    vi.spyOn(window, 'showOpenDialog').mockImplementation(options => (options as { openLabel?: string })?.openLabel === 'Choose Project'
      ? oldFolder.answer() : Promise.resolve([Uri.file(join(host.directory, 'library'))]));
    const oldChoose = commands.executeCommand('expec.chooseProject');
    try {
      await oldFolder.started;
      await commands.executeCommand('expec.newConnection'); await connected('library'); await host.settleRequestedSave();
      const newerSaved = await host.savedConfiguration();
      expect(JSON.parse(newerSaved)).toMatchObject({ project: { root: join(host.directory, 'library') }, outputs: [{ id: 'markdown', options: { directory: 'docs' } }] });
      oldFolder.release([Uri.file(join(host.directory, 'shop'))]); await oldChoose; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(newerSaved);
      await connected('library');
    } finally { oldFolder.release(undefined); await oldChoose; }
  });
  it('starting Choose cancels an older New destination before its own folder picker completes', async () => {
    const { host } = await start(); chooseNewOutput(host);
    const destination = heldAnswer<string | undefined>(), folder = heldAnswer<Uri[] | undefined>();
    vi.spyOn(window, 'showInputBox').mockImplementation(() => destination.answer());
    vi.spyOn(window, 'showOpenDialog').mockImplementation(options => (options as { openLabel?: string })?.openLabel === 'Choose Project'
      ? folder.answer() : Promise.resolve([Uri.file(join(host.directory, 'library'))]));
    const oldNew = commands.executeCommand('expec.newConnection');
    let choose: Promise<unknown> | undefined;
    try {
      await destination.started;
      choose = commands.executeCommand('expec.chooseProject'); await folder.started;
      destination.release('docs'); await oldNew; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
      await connected('shop');
      folder.release([Uri.file(join(host.directory, 'shop'))]); await choose; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
    } finally { destination.release(undefined); folder.release(undefined); await oldNew; await choose; }
  });
  it('starting Choose cancels an older Delete confirmation before its own folder picker completes', async () => {
    const { host } = await start(), confirmation = heldAnswer<string | undefined>(), folder = heldAnswer<Uri[] | undefined>();
    vi.spyOn(window, 'showWarningMessage').mockImplementation(() => confirmation.answer());
    vi.spyOn(window, 'showOpenDialog').mockImplementation(() => folder.answer());
    const oldDelete = commands.executeCommand('expec.deleteConnection');
    let choose: Promise<unknown> | undefined;
    try {
      await confirmation.started;
      choose = commands.executeCommand('expec.chooseProject'); await folder.started;
      confirmation.release('Delete Connection'); await oldDelete; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
      await connected('shop');
      folder.release([Uri.file(join(host.directory, 'shop'))]); await choose; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
    } finally { confirmation.release(undefined); folder.release(undefined); await oldDelete; await choose; }
  });
  it('the first command surfaces its current failure after selecting its own initial manifest', async () => {
    host = await RecordedSidebarHost.create(shop);
    sidebar = new ConnectionSidebar(host.context, { configurationChanged() {} });
    const actualStat = workspace.fs.stat;
    vi.spyOn(workspace.fs, 'stat').mockImplementation(uri => uri.fsPath === host!.file
      ? Promise.reject(new Error('Selected manifest editor failed.')) : actualStat(uri));
    await commands.executeCommand('expec.editConnection'); await host.settleRequestedSave();
    expect(host.messages).toContainEqual({ kind: 'error', text: 'Cannot follow the project connection: Error: Selected manifest editor failed.' });
    expect((await host.rows())[0]?.tooltip).toContain('Selected manifest editor failed.');
    expect(await host.savedConfiguration()).toBe(shop);
    expect(host.writes).toEqual([]);
  });
  it('a superseding command suppresses a failed older Edit without marking the newer connection unavailable', async () => {
    const { host } = await start(); chooseNewOutput(host); host.inputAnswers.push('docs');
    const actualStat = workspace.fs.stat;
    let entered!: () => void, fail!: (error: Error) => void, first = true;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const failedStat = new Promise<Awaited<ReturnType<typeof actualStat>>>((_, reject) => { fail = reject; });
    vi.spyOn(workspace.fs, 'stat').mockImplementation(uri => {
      if (first && uri.fsPath === host.file) { first = false; entered(); return failedStat; }
      return actualStat(uri);
    });
    const oldEdit = commands.executeCommand('expec.editConnection');
    try {
      await started;
      await commands.executeCommand('expec.newConnection'); await connected('library'); await host.settleRequestedSave();
      fail(new Error('Obsolete editor failure.')); await oldEdit; await host.settleRequestedSave();
      expect(host.messages.some(message => message.kind === 'error' && message.text.includes('Obsolete editor failure'))).toBe(false);
      await connected('library');
      expect(JSON.parse(await host.savedConfiguration()).outputs).toEqual([{ id: 'markdown', options: { directory: 'docs' } }]);
    } finally { fail(new Error('Obsolete editor failure.')); await oldEdit; }
  });
});

describe('Delete rechecks the confirmed saved selection after native read events', () => {
  async function pendingDelete() {
    const fixture = await start(), confirmation = heldAnswer<string | undefined>();
    vi.spyOn(window, 'showWarningMessage').mockImplementation(() => confirmation.answer());
    const command = commands.executeCommand('expec.deleteConnection');
    await confirmation.started;
    return { ...fixture, confirmation, command };
  }
  async function removedProject(host: RecordedSidebarHost) {
    expect(JSON.parse(await host.savedConfiguration())).toEqual({
      formatVersion: 1, version: '0.1.0', build: { entries: ['src/main.expec'] }, outputs: [],
    });
    expect(await host.rows()).toContainEqual(expect.objectContaining({ contextValue: 'unconfigured' }));
  }
  it('an identical-byte notification completed during confirmation still permits actual deletion', async () => {
    const { host, sidebar, confirmation, command } = await pendingDelete();
    let publications = 0;
    const observation = sidebar.onDidChangeTreeData(() => { publications++; });
    try {
      await host.replaceSavedConfiguration(shop); await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(publications).toBeGreaterThan(0);
      confirmation.release('Delete Connection'); await command; await host.settleRequestedSave();
      await removedProject(host);
    } finally { observation.dispose(); confirmation.release(undefined); await command; }
  });
  it('the accepted fresh read supersedes an identical-byte read still in flight', async () => {
    const { host, confirmation, command } = await pendingDelete(), oldRead = host.holdNextRead(host.file);
    try {
      await host.replaceSavedConfiguration(shop); await oldRead.started;
      confirmation.release('Delete Connection'); await command; await host.settleRequestedSave([oldRead]);
      await removedProject(host);
      oldRead.release(); await host.settleRequestedSave();
      await removedProject(host);
    } finally { oldRead.release(); confirmation.release(undefined); await command; }
  });
  it('a dirty document during confirmation keeps both saved and unsaved configuration', async () => {
    const { host, confirmation, command } = await pendingDelete();
    try {
      await host.editWithoutSaving(library); await host.settleRequestedSave();
      confirmation.release('Delete Connection'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.documents[0]!.getText()).toBe(library);
      expect(host.documents[0]!.isDirty).toBe(true);
      expect(host.writes).toEqual([]);
    } finally { confirmation.release(undefined); await command; }
  });
  it('a replacement selection during confirmation cannot delete either manifest', async () => {
    const { host, sidebar, confirmation, command } = await pendingDelete();
    const selected = await host.addConfiguration('selected.json', library);
    try {
      sidebar.start(selected); await host.settleRequestedSave();
      confirmation.release('Delete Connection'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(await readFile(selected, 'utf8')).toBe(library);
      expect(host.writes).toEqual([]);
    } finally { confirmation.release(undefined); await command; }
  });
  it('disposal during confirmation prevents a late deletion', async () => {
    const { host, sidebar, confirmation, command } = await pendingDelete();
    try {
      sidebar.dispose(); confirmation.release('Delete Connection'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
      expect(host.registrations.every(resource => resource.disposed)).toBe(true);
      expect(host.watchers.every(watcher => watcher.disposed)).toBe(true);
    } finally { confirmation.release(undefined); await command; }
  });
  it('failure of the accepted saved read leaves the original bytes untouched', async () => {
    const { host, confirmation, command } = await pendingDelete();
    vi.spyOn(workspace.fs, 'readFile').mockRejectedValueOnce(new Error('Selected manifest read failed.'));
    try {
      confirmation.release('Delete Connection'); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
    } finally { confirmation.release(undefined); await command; }
  });
  it('a newer notification supersedes the accepted read without forwarding a late deletion', async () => {
    const { host, confirmation, command } = await pendingDelete(), acceptedRead = host.holdNextRead(host.file);
    try {
      confirmation.release('Delete Connection'); await acceptedRead.started;
      await host.replaceSavedConfiguration(shop); await host.settleRequestedSave([acceptedRead]);
      acceptedRead.release(); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(host.writes).toEqual([]);
    } finally { acceptedRead.release(); confirmation.release(undefined); await command; }
  });
  it('selection replacement during the accepted read cannot refresh or delete the new selection', async () => {
    const { host, sidebar, confirmation, command } = await pendingDelete();
    const selected = await host.addConfiguration('selected.json', library), acceptedRead = host.holdNextRead(host.file);
    try {
      confirmation.release('Delete Connection'); await acceptedRead.started;
      sidebar.start(selected); await host.settleRequestedSave([acceptedRead]);
      acceptedRead.release(); await command; await host.settleRequestedSave();
      expect(await host.savedConfiguration()).toBe(shop);
      expect(await readFile(selected, 'utf8')).toBe(library);
      expect(host.writes).toEqual([]);
      await connected('library');
    } finally { acceptedRead.release(); confirmation.release(undefined); await command; }
  });
});

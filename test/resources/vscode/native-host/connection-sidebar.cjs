const { basename, join, resolve, relative, isAbsolute } = require('node:path');
const { preparedWorkspaceWatch } = require('./diagnostic-document.cjs');

// Native observations use the installed, registered provider and real host events.
exports.openConnectionSidebar = async function openConnectionSidebar(vscode, extensionId, setup) {
  const client = await vscode.extensions.getExtension(extensionId)?.activate();
  const provider = client?.connectionTreeProvider;
  if (!provider || typeof provider.start !== 'function' || typeof provider.getChildren !== 'function'
    || typeof provider.getTreeItem !== 'function' || typeof provider.onDidChangeTreeData !== 'function') {
    throw new Error('The installed extension did not expose its actual connection TreeDataProvider.');
  }
  const file = vscode.Uri.file(setup.file);
  let revision = 0, disposed = false;
  const events = [];
  const sourceFiles = new Map(), panels = new Set();
  let previewDocument;
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(setup.directory), '*'));
  const received = uri => { events.push(uri.toString()); };
  const resources = [watcher, watcher.onDidCreate(received), watcher.onDidChange(received), watcher.onDidDelete(received),
    provider.onDidChangeTreeData(() => { revision++; })];
  async function row(filename = setup.file) {
    const captured = revision;
    const children = await provider.getChildren();
    if (revision !== captured) return undefined;
    if (!Array.isArray(children) || children.length !== 1 || children[0].configurationFile !== filename) return undefined;
    const item = await provider.getTreeItem(children[0]);
    if (revision !== captured) return undefined;
    if (typeof item.contextValue !== 'string' || item.contextValue === 'checking') return undefined;
    return { revision: captured, status: item.contextValue, project: typeof item.description === 'string' ? basename(item.description) : '',
      explanation: typeof item.tooltip === 'string' ? item.tooltip : item.tooltip?.value ?? '', target: item.description };
  }
  async function settled(after = -1, filename = setup.file, deadline = Date.now() + 30_000) {
    let actual;
    await until(async () => (actual = await row(filename)) && actual.revision > after, 'The actual native connection row did not settle.', deadline);
    return actual;
  }
  async function observation() {
    const deadline = Date.now() + 30_000;
    while (true) {
      const actual = await settled(-1, setup.file, deadline);
      let saved;
      try { saved = Buffer.from(await vscode.workspace.fs.readFile(file)).toString('utf8'); }
      catch (error) { if (error.code !== 'FileNotFound') throw error; }
      const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === file.toString() && document.isDirty);
      const unsaved = document?.getText();
      if (revision !== actual.revision) {
        if (Date.now() >= deadline) throw new Error('The native connection observation remained obsolete.');
        continue;
      }
      return { status: actual.status, project: actual.project, explanation: actual.explanation,
        ...(saved === undefined ? {} : { saved }), ...(unsaved === undefined ? {} : { unsaved }),
        ...(vscode.window.activeTextEditor ? { activeFile: vscode.window.activeTextEditor.document.uri.fsPath } : {}),
        ...(previewDocument ? { sourceUri: previewDocument.uri.toString(), sourceVersion: previewDocument.version } : {}) };
    }
  }
  function project(name) {
    if (typeof name !== 'string' || basename(name) !== name || name === '.' || name === '..') throw new Error('Use one owned project directory name.');
    return vscode.Uri.file(join(setup.directory, name));
  }
  function ownedSource(name) {
    if (typeof name !== 'string' || !name.endsWith('.expec')) throw new Error('Select an actual owned .expec source.');
    const filename = resolve(setup.directory, name), local = relative(setup.directory, filename);
    if (!local || isAbsolute(local) || local === '..' || local.startsWith('..' + require('node:path').sep)) throw new Error('Source selection left the owned sidebar directory.');
    return vscode.Uri.file(filename);
  }
  async function manage(action) {
    if (disposed) throw new Error('The owned native sidebar case is disposed.');
    if (action.kind === 'activityBar') await vscode.commands.executeCommand('workbench.view.extension.expec');
    else if (action.kind === 'editConnection') await vscode.commands.executeCommand('expec.editConnection');
    else if (action.kind === 'newConnection') {
      await vscode.commands.executeCommand('expec.newConnection');
    } else if (action.kind === 'disconnect') await vscode.commands.executeCommand('expec.disconnectConnection');
    else if (action.kind === 'reconnect') await vscode.commands.executeCommand('expec.reconnectConnection');
    else if (action.kind === 'delete') {
      await vscode.commands.executeCommand('expec.deleteConnection');
    } else if (action.kind === 'previewSource') {
      const uri = ownedSource(action.source), initialTabs = new Set(vscode.window.tabGroups.all.flatMap(group => group.tabs));
      const capturePanels = () => {
        for (const tab of vscode.window.tabGroups.all.flatMap(group => group.tabs)) if (!initialTabs.has(tab)
          && tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'mainThreadWebview-expec.outputPreviews') panels.add(tab);
      };
      resources.push(vscode.window.tabGroups.onDidChangeTabs(capturePanels));
      previewDocument = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(previewDocument, { preview: false });
      let sourceGroup;
      await until(() => (sourceGroup = vscode.window.tabGroups.all.find(group => group.tabs.some(tab => tab.input?.uri?.toString() === uri.toString()))), 'The owned sidebar source did not open in a native tab group.');
      sourceFiles.set(uri.toString(), sourceGroup.viewColumn);
      // Keep the selected controller and its session-only disconnect intact.
      await vscode.commands.executeCommand('expec.showOutputPreviews');
      await until(() => { capturePanels(); return [...panels].some(tab => tab.isActive); }, 'The actual owned preview panel did not open.');
    } else throw new Error('Unsupported native sidebar management action.');
    return observation();
  }
  async function changeFile(uri, operation, relevant) {
    const before = revision, afterEvent = events.length;
    await operation();
    await until(() => events.slice(afterEvent).includes(uri.toString()), 'The actual native owned-file event was not received.');
    if (relevant) await settled(before);
    return observation();
  }
  async function dispose() {
    if (disposed) return;
    const deadline = Date.now() + 30_000;
    const errors = [];
    for (const panel of panels) try {
      if (vscode.window.tabGroups.all.some(group => group.tabs.includes(panel)) && !await beforeDeadline(vscode.window.tabGroups.close(panel), deadline, 'The owned sidebar preview did not close.')) throw new Error('The owned sidebar preview refused close.');
    } catch (error) { errors.push(error); }
    for (const [source, viewColumn] of sourceFiles) try {
      const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === source);
      if (document && vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input?.uri?.toString() === source))) {
        await beforeDeadline(vscode.window.showTextDocument(document, { preview: false, viewColumn }), deadline, 'The owned sidebar source did not activate for cleanup.');
        await beforeDeadline(vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'), deadline, 'The owned sidebar source did not close.');
        await until(() => !vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input?.uri?.toString() === source)), 'The owned sidebar source remained open.', deadline);
      }
    } catch (error) { errors.push(error); }
    try {
      const ownedTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs)
        .filter(tab => tab.input?.uri?.toString() === file.toString());
      const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === file.toString());
      if (document && ownedTabs().length) {
        await beforeDeadline(vscode.window.showTextDocument(document), deadline, 'The owned configuration editor did not activate for cleanup.');
        await beforeDeadline(vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'), deadline, 'The owned configuration editor did not discard and close.');
        await until(() => ownedTabs().length === 0, 'The owned configuration tabs remain open.', deadline);
      }
      provider.start(setup.resetFile);
      const after = revision;
      await beforeDeadline(settled(after, setup.resetFile), deadline, 'The sidebar did not leave the owned configuration.');
      disposed = true;
    } catch (error) { errors.push(error); }
    finally { for (const resource of resources) try { resource.dispose(); } catch (error) { errors.push(error); } }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'Owned native sidebar cleanup failed.');
  }
  try {
    provider.start(setup.file);
    const after = revision;
    await settled(after);
    await preparedWorkspaceWatch(vscode, setup.file);
    return {
      observation, manage,
      async action(kind, name, text) {
        if (disposed) throw new Error('The owned native sidebar case is disposed.');
        if (kind === 'choose') {
          const before = revision;
          await vscode.commands.executeCommand('expec.chooseProject', project(name));
          await settled(before);
          return observation();
        }
        if (kind === 'save') return changeFile(file, () => vscode.workspace.fs.writeFile(file, Buffer.from(text, 'utf8')), true);
        if (kind === 'remove' || kind === 'restore') {
          const uri = project(name), actual = await settled();
          return changeFile(uri, () => kind === 'remove' ? vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false })
            : vscode.workspace.fs.createDirectory(uri), actual.status !== 'disconnected' && typeof actual.target === 'string' && samePath(actual.target, uri.fsPath));
        }
        if (kind === 'edit') {
          const document = await vscode.workspace.openTextDocument(file);
          await vscode.window.showTextDocument(document);
          const before = revision, edit = new vscode.WorkspaceEdit();
          edit.replace(file, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
          if (!await vscode.workspace.applyEdit(edit)) throw new Error('The real unsaved configuration edit was refused.');
          await until(() => document.isDirty && document.getText() === text, 'The actual configuration edit was not retained as unsaved.');
          await settled(before);
          return observation();
        }
        throw new Error('Unsupported owned sidebar action.');
      },
      dispose,
    };
  } catch (error) { await dispose(); throw error; }
};
function samePath(first, second) { return process.platform === 'win32' ? resolve(first).toLowerCase() === resolve(second).toLowerCase() : resolve(first) === resolve(second); }
async function until(predicate, explanation, deadline = Date.now() + 30_000) {
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error(explanation);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function beforeDeadline(operation, deadline, explanation) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(explanation)), Math.max(0, deadline - Date.now())); })]); }
  finally { clearTimeout(timer); }
}

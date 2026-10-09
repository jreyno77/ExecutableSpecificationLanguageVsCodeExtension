const fs = require('node:fs/promises');
const { resolve, relative, isAbsolute, sep } = require('node:path');

// Real editor actions and plain observations; no product state or result is substituted.
exports.openGenerationEditor = async function openGenerationEditor(vscode, extensionId, setup) {
  const client = await vscode.extensions.getExtension(extensionId)?.activate();
  const provider = client?.connectionTreeProvider;
  if (!provider || typeof provider.start !== 'function' || typeof provider.getChildren !== 'function'
    || typeof provider.getTreeItem !== 'function') throw new Error('The installed product has no actual connection provider.');
  const original = { file: setup.file, other: setup.other, configurationFile: setup.configurationFile, directory: setup.directory };
  let selected = original, document, disposed = false;
  const ownedRoots = new Set([resolve(setup.directory)]), opened = new Map();
  const configuration = vscode.workspace.getConfiguration('expec', vscode.Uri.file(setup.configurationFile));
  const previousRuntime = configuration.inspect('nodeExecutable')?.workspaceValue;
  async function open(file) {
    if (![...ownedRoots].some(root => inside(root, file))) throw new Error('The native generation document escaped its owned root.');
    const value = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    opened.set(value.uri.toString(), value); return value;
  }
  async function select(next) {
    if (!inside(setup.workspace, next.directory)) throw new Error('The generation selection escaped its owned workspace.');
    ownedRoots.add(resolve(next.directory)); selected = { ...next };
    provider.start(selected.configurationFile);
    await until(async () => {
      const children = await provider.getChildren();
      if (!Array.isArray(children) || children.length !== 1 || children[0].configurationFile !== selected.configurationFile) return false;
      return (await provider.getTreeItem(children[0])).contextValue === 'connected';
    }, 'The actual saved generation selection did not settle.');
    document = await open(selected.file);
    await vscode.window.showTextDocument(document, { preview: false });
  }
  async function observation() {
    return { uri: document.uri.toString(), version: document.version, text: document.getText(), dirty: document.isDirty,
      savedText: await fs.readFile(document.uri.fsPath, 'utf8'), configurationFile: selected.configurationFile,
      dirtyBuffers: vscode.workspace.textDocuments.filter(value => value.uri.scheme === 'file' && value.isDirty)
        .filter(value => [...ownedRoots].some(root => inside(root, value.uri.fsPath)))
        .map(value => ({ uri: value.uri.toString(), text: value.getText(), version: value.version, dirty: value.isDirty })),
      outputDocuments: vscode.workspace.textDocuments.filter(value => value.uri.scheme === 'output')
        .map(value => ({ uri: value.uri.toString(), text: value.getText() })) };
  }
  async function edit(file, text, save, hide) {
    const value = await open(file), before = value.version, change = new vscode.WorkspaceEdit();
    await vscode.window.showTextDocument(value, { preview: false });
    const edits = [vscode.TextEdit.replace(new vscode.Range(value.positionAt(0), value.positionAt(value.getText().length)), text)];
    const newline = text.match(/\r?\n/);
    if (newline) edits.push(vscode.TextEdit.setEndOfLine(newline[0] === '\r\n' ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF));
    change.set(value.uri, edits);
    if (!await vscode.workspace.applyEdit(change)) throw new Error('The actual generation editor refused its owned edit.');
    try {
      await until(() => value.version > before && value.getText() === text && value.isDirty, 'The actual native edit was not retained.');
    } catch (error) {
      throw new Error('The actual native edit was not retained: ' + JSON.stringify({ file, before,
        version: value.version, eol: value.eol, text: value.getText(), expected: text, sameText: value.getText() === text, dirty: value.isDirty, closed: value.isClosed,
        current: vscode.workspace.textDocuments.filter(item => item.uri.toString() === value.uri.toString())
          .map(item => ({ version: item.version, sameText: item.getText() === text, dirty: item.isDirty, closed: item.isClosed })) }), { cause: error });
    }
    if (save) {
      if (!await value.save()) throw new Error('The actual generation document did not save.');
      await until(async () => !value.isDirty && await fs.readFile(value.uri.fsPath, 'utf8') === text, 'The actual post-save bytes did not match the editor.');
    }
    if (hide) await vscode.window.showTextDocument(document, { preview: false });
    return observation();
  }
  async function dispose() {
    if (disposed) return;
    const errors = [];
    for (const selection of [selected, original].filter((value, index, all) => all.findIndex(item => item.configurationFile === value.configurationFile) === index)) {
      try { await select(selection); await vscode.commands.executeCommand('expec.disableGenerationOnSave'); } catch (error) { errors.push(error); }
    }
    try { provider.start(setup.resetFile); } catch (error) { errors.push(error); }
    for (const value of opened.values()) {
      try {
        if (value.isClosed) continue;
        await vscode.window.showTextDocument(value, { preview: false });
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        await until(() => !vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input?.uri?.toString() === value.uri.toString()))
          && vscode.workspace.textDocuments.filter(item => item.uri.toString() === value.uri.toString()).every(item => !item.isDirty),
          'An owned generation tab or dirty buffer remained after discard.');
      } catch (error) { errors.push(error); }
    }
    try { await configuration.update('nodeExecutable', previousRuntime, vscode.ConfigurationTarget.Workspace); } catch (error) { errors.push(error); }
    disposed = errors.length === 0;
    if (errors.length) throw new AggregateError(errors, 'Actual generation editor cleanup failed: ' + errors.map(value => String(value)).join(' | '));
  }
  try {
    await configuration.update('nodeExecutable', setup.nodeExecutable, vscode.ConfigurationTarget.Workspace);
    await select(original);
    await vscode.commands.executeCommand(setup.enabled ? 'expec.enableGenerationOnSave' : 'expec.disableGenerationOnSave');
    await vscode.commands.executeCommand('expec.generation.showLog');
    return {
      observation, dispose,
      async action(kind, values) {
        if (disposed) throw new Error('The native generation case is disposed.');
        if (kind === 'edit') return edit(selected.file, values.text, false, false);
        if (kind === 'save') {
          if (!await document.save()) throw new Error('The real selected source save was refused.');
          await until(() => !document.isDirty, 'The actual selected source remains dirty after saving.'); return observation();
        }
        if (kind === 'otherEdit' || kind === 'otherSave') return edit(selected.other, values.text, kind === 'otherSave', true);
        if (kind === 'keep' || kind === 'dirtyTarget') return edit(values.file, values.text, kind === 'keep', true);
        if (kind === 'enable') await vscode.commands.executeCommand(values.enabled ? 'expec.enableGenerationOnSave' : 'expec.disableGenerationOnSave');
        else if (kind === 'selectOriginal') await select(original);
        else if (kind === 'selectOther') await select(values);
        else if (kind === 'showLog') await vscode.commands.executeCommand('expec.generation.showLog');
        else throw new Error('Unsupported actual generation editor action.');
        return observation();
      },
    };
  } catch (error) {
    try { await dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native generation setup and cleanup failed', { cause: error }); }
    throw error;
  }
};
function inside(root, path) { const local = relative(resolve(root), resolve(path)); return local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local); }
async function until(condition, message, deadline = Date.now() + 30_000) {
  while (!await condition()) { if (Date.now() >= deadline) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 10)); }
}

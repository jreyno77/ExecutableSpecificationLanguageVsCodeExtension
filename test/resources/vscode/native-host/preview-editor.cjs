const fs = require('node:fs/promises');

// Owns native document/panel actions; rendered observations belong to the CDP driver.
exports.openPreviewEditor = async function openPreviewEditor(vscode, extensionId, setup) {
  const client = await vscode.extensions.getExtension(extensionId)?.activate();
  const provider = client?.connectionTreeProvider;
  if (!provider || typeof provider.start !== 'function') throw new Error('The installed product has no actual connection provider.');
  const uri = vscode.Uri.file(setup.file), configuration = vscode.Uri.file(setup.configurationFile);
  let document, sourceGroup, disposed = false;
  const panels = new Set();
  function tabs() { return vscode.window.tabGroups.all.flatMap(group => group.tabs); }
  function tabState() { return { activeEditor: vscode.window.activeTextEditor?.document.uri.toString(), groups: vscode.window.tabGroups.all.map(group => ({ column: group.viewColumn, isActive: group.isActive, tabs: group.tabs.map(tab => ({ label: tab.label, isActive: tab.isActive, inputType: tab.input?.constructor?.name, isWebview: tab.input instanceof vscode.TabInputWebview, viewType: tab.input?.viewType, uri: tab.input?.uri?.toString() })) })) }; }
  const ownsSource = tab => tab?.input?.uri?.toString() === uri.toString();
  const ownsPanel = tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'mainThreadWebview-expec.outputPreviews';
  const initialTabs = new Set(tabs());
  function capturePanels() { for (const tab of tabs()) if (!initialTabs.has(tab) && ownsPanel(tab)) panels.add(tab); }
  const panelTabs = vscode.window.tabGroups.onDidChangeTabs(capturePanels);
  async function observation() {
    return { uri: document.uri.toString(), version: document.version, text: document.getText(), dirty: document.isDirty,
      savedText: await fs.readFile(document.uri.fsPath, 'utf8') };
  }
  async function closePanel() {
    capturePanels();
    for (const panel of panels) if (tabs().includes(panel)) {
      if (!await vscode.window.tabGroups.close(panel)) throw new Error('The actual owned preview panel did not close.');
      await until(() => !tabs().includes(panel), 'The owned preview panel remained in the native tab model.');
    }
    panels.clear(); return document ? observation() : undefined;
  }
  async function dispose() {
    if (disposed) return;
    const errors = [];
    try { await closePanel(); } catch (error) { errors.push(error); }
    try {
      if (document && sourceGroup?.tabs.some(ownsSource)) {
        await vscode.window.showTextDocument(document, { preview: false, viewColumn: sourceGroup.viewColumn });
        await until(() => vscode.window.activeTextEditor?.document === document
          && vscode.window.tabGroups.activeTabGroup.viewColumn === sourceGroup.viewColumn
          && ownsSource(vscode.window.tabGroups.activeTabGroup.activeTab), 'The owned source tab did not become active in its original native group.');
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        await until(() => !tabs().some(ownsSource), 'Owned preview source remained open after discard.');
      }
    } catch (error) { errors.push(error); }
    try { provider.start(setup.resetFile); } catch (error) { errors.push(error); }
    try { panelTabs.dispose(); } catch (error) { errors.push(error); }
    disposed = errors.length === 0;
    if (errors.length) throw new AggregateError(errors, 'Owned preview editor cleanup failed. ' + errors.map(error => error.message).join(' | ') + ' ' + JSON.stringify(tabState()));
  }
  try {
    provider.start(setup.configurationFile);
    document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
    await until(() => (sourceGroup = vscode.window.tabGroups.all.find(group => group.tabs.some(ownsSource))), 'The owned preview source did not appear in the native tab model.');
    return {
      observation, closePanel, dispose,
      async show() {
        if (disposed) throw new Error('The native preview case is disposed.');
        // Invoke once. Missing command is the meaningful baseline failure, not a timeout.
        await vscode.commands.executeCommand('expec.showOutputPreviews');
        let panel;
        await until(() => { capturePanels(); return (panel = [...panels].find(tab => tabs().includes(tab) && tab.isActive)); },
          () => 'Show Output Previews did not reveal an actual owned webview tab. ' + JSON.stringify(tabState()));
        panels.add(panel); return observation();
      },
      async edit(text) {
        const before = document.version, edit = new vscode.WorkspaceEdit();
        edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('The actual unsaved preview source edit was refused.');
        await until(() => document.version > before && document.getText() === text && document.isDirty, 'The preview source did not retain the unsaved edit.');
        return observation();
      },
      async saveConfiguration(text) {
        await vscode.workspace.fs.writeFile(configuration, Buffer.from(text, 'utf8'));
        return observation();
      },
    };
  } catch (error) {
    try { await dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Owned preview setup failed: ' + error.message + '; cleanup failed: ' + cleanupError.message, { cause: error }); }
    throw error;
  }
};
async function until(predicate, explanation, deadline = Date.now() + 30_000) {
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error(typeof explanation === 'function' ? explanation() : explanation);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

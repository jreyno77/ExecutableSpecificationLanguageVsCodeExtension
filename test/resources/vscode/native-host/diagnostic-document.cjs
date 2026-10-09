const fs = require('node:fs/promises');

// The case observes the installed product through VS Code and its exported native client.
exports.openDiagnosticDocument = async function openDiagnosticDocument(vscode, extensionId, setup) {
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) throw new Error('The installed diagnostic extension is unavailable.');
  const client = await extension.activate();
  if (!client || typeof client.getFeature !== 'function') throw new Error('Activation did not export the native language client.');
  await until(() => client.getFeature('textDocument/diagnostic').getState().registrations, 'The native diagnostic feature was not registered.');
  const listeners = [];
  const opened = new WeakMap();
  const changed = new WeakMap();
  const closedNotifications = new WeakSet();
  let document;
  let closed = false;
  let tabClosed = false;
  let disposed = false;
  let previousProblemCount = 0;
  let eventNumber = 0;
  let applied = [];
  listeners.push(client.getFeature('textDocument/didOpen').onNotificationSent(event => {
    opened.set(event.textDocument, event.params.textDocument.version);
  }));
  listeners.push(client.getFeature('textDocument/didChange').onNotificationSent(event => {
    changed.set(event.textDocument, event.params.textDocument.version);
  }));
  listeners.push(client.getFeature('textDocument/didClose').onNotificationSent(event => { closedNotifications.add(event.textDocument); }));
  listeners.push(vscode.workspace.onDidCloseTextDocument(actual => { if (actual === document) closed = true; }));
  listeners.push(vscode.window.tabGroups.onDidChangeTabs(event => {
    if (document && event.closed.some(ownsTab)) tabClosed = true;
  }));
  function ownsTab(tab) { return tab.input?.uri?.toString() === document.uri.toString(); }
  function hasTab() { return vscode.window.tabGroups.all.some(group => group.tabs.some(ownsTab)); }
  function visible() { return vscode.window.visibleTextEditors.some(editor => editor.document === document); }
  listeners.push(vscode.languages.onDidChangeDiagnostics(event => {
    if (document && event.uris.some(uri => uri.toString() === document.uri.toString())) {
      applied.push({ number: ++eventNumber, version: document.version, diagnostics: currentDiagnostics() });
      if (applied.length > 30) applied.shift();
    }
  }));
  function currentDiagnostics() { return vscode.languages.getDiagnostics(document.uri).map(diagnosticPacket); }
  async function provider() {
    let actual;
    await until(() => (actual = client.getFeature('textDocument/diagnostic').getProvider(document)), 'The native diagnostic provider was not registered.');
    return actual.diagnostics;
  }
  async function observe(requireApplication, afterEvent) {
    const snapshot = document;
    const version = snapshot.version;
    const diagnosticsProvider = await provider();
    const cancellation = new vscode.CancellationTokenSource();
    let report;
    try { report = await diagnosticsProvider.provideDiagnostics(snapshot, undefined, cancellation.token); }
    finally { cancellation.dispose(); }
    if (snapshot !== document || snapshot.isClosed || snapshot.version !== version) throw new Error('The diagnostic observation became obsolete.');
    if (!report || report.kind !== 'full' || report.resultId !== String(version)) {
      throw new Error('The native diagnostic report did not describe the captured document version.');
    }
    const expected = report.items.map(diagnosticPacket);
    if (requireApplication) {
      await until(() => applied.some(event => event.number > afterEvent && event.version === version
        && sameDiagnostics(event.diagnostics, expected)) && sameDiagnostics(currentDiagnostics(), expected),
      'The current native diagnostic report was not applied to the editor collection.');
    }
    return observation();
  }
  async function observation() {
    return { uri: document.uri.toString(), text: document.getText(), version: document.version, dirty: document.isDirty,
      savedText: document.uri.scheme === 'file' ? await fs.readFile(document.uri.fsPath, 'utf8') : null,
      previousProblemCount, diagnostics: currentDiagnostics(), closed: tabClosed };
  }
  async function close() {
    if (!tabClosed) {
      previousProblemCount = currentDiagnostics().length;
      const afterEvent = eventNumber;
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      await until(() => tabClosed && !hasTab() && !visible() && currentDiagnostics().length === 0
        && (previousProblemCount === 0 || applied.some(event => event.number > afterEvent && event.diagnostics.length === 0)),
      () => 'Closing the owned native document did not clear its diagnostics. ' + JSON.stringify({
        uri: document.uri.toString(), tabClosed, hasTab: hasTab(), closedEvent: closed, documentClosed: document.isClosed,
        closeNotificationSent: closedNotifications.has(document), version: document.version,
        previousProblemCount, problemCount: currentDiagnostics().length,
        applicationEvents: applied.map(event => ({ number: event.number, version: event.version, count: event.diagnostics.length })),
        afterEvent, remainsOpen: vscode.workspace.textDocuments.includes(document),
        visible: vscode.window.visibleTextEditors.some(editor => editor.document === document),
        active: vscode.window.activeTextEditor?.document.uri.toString(),
        tabs: vscode.window.tabGroups.all.flatMap(group => group.tabs).map(tab => tab.input?.uri?.toString()).filter(Boolean),
      }));
    }
    return observation();
  }
  try {
    document = setup.untitled
      ? await vscode.workspace.openTextDocument({ language: 'expec', content: setup.text })
      : await vscode.workspace.openTextDocument(vscode.Uri.file(setup.file));
    await vscode.window.showTextDocument(document);
    await until(() => opened.get(document) === document.version, 'The native document open was not synchronized.');
    await observe(false, eventNumber);
    return {
      observation,
      async edit(texts) {
        if (disposed || tabClosed || document.isClosed) throw new Error('The owned native document is closed.');
        previousProblemCount = currentDiagnostics().length;
        const afterEvent = eventNumber;
        applied = [];
        for (const text of texts) {
          const edit = new vscode.WorkspaceEdit();
          const edits = [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text)];
          const newline = text.match(/\r?\n/);
          if (newline) edits.push(vscode.TextEdit.setEndOfLine(newline[0] === '\r\n' ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF));
          edit.set(document.uri, edits);
          if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code refused the owned document edit.');
        }
        const version = document.version;
        await until(() => changed.get(document) === version, 'The latest native document edit was not synchronized.');
        return observe(true, afterEvent);
      },
      close,
      async dispose() {
        if (disposed) return;
        disposed = true;
        try { await close(); }
        finally { for (const listener of listeners) listener.dispose(); }
      },
    };
  } catch (error) {
    try { if (document && !tabClosed) await close(); }
    finally { for (const listener of listeners) listener.dispose(); }
    throw error;
  }
};
function diagnosticPacket(diagnostic) {
  const range = value => ({ start: { line: value.start.line, character: value.start.character },
    end: { line: value.end.line, character: value.end.character } });
  return { message: diagnostic.message, severity: diagnostic.severity, range: range(diagnostic.range),
    code: typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code, source: diagnostic.source,
    relatedInformation: diagnostic.relatedInformation?.map(related => ({ message: related.message,
      location: { uri: related.location.uri.toString(), range: range(related.location.range) } })) };
}
function sameDiagnostics(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
async function until(predicate, explanation) {
  const deadline = Date.now() + 30_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(typeof explanation === 'function' ? explanation() : explanation);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

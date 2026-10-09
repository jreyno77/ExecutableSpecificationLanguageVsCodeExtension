const fs = require('node:fs/promises');
const { dirname, join } = require('node:path');

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
  let initialVersion;
  let resultId;
  let watchedNotifications = 0;
  const sentFileChanges = [];
  let dependencyRegistered = !setup.dependencyFile;
  if (setup.dependencyFile) {
    const dependencyUri = vscode.Uri.file(setup.dependencyFile).toString();
    const parentUri = vscode.Uri.file(dirname(setup.dependencyFile)).toString().replace(/[/]$/, '');
    const watcher = client.getFeature('workspace/didChangeWatchedFiles');
    const originalRegister = watcher.register;
    const observedRegister = function(data) {
      originalRegister.call(this, data);
      if (data.registerOptions?.watchers?.some(item => {
        const pattern = item.globPattern;
        const base = typeof pattern?.baseUri === 'string' ? pattern.baseUri : pattern?.baseUri?.uri;
        return base?.replace(/[/]$/, '') === parentUri && pattern.pattern === 'book.expec';
      })) dependencyRegistered = true;
    };
    watcher.register = observedRegister;
    listeners.push({ dispose() { if (watcher.register === observedRegister) watcher.register = originalRegister; } });
    const originalSend = client.sendNotification;
    const observedSend = function(type, ...params) {
      const sending = originalSend.call(this, type, ...params);
      if ((typeof type === 'string' ? type : type.method) !== 'workspace/didChangeWatchedFiles') return sending;
      return Promise.resolve(sending).then(() => {
        const changes = params[0]?.changes ?? [];
        sentFileChanges.push(...changes);
        if (sentFileChanges.length > 10) sentFileChanges.splice(0, sentFileChanges.length - 10);
        if (changes.some(change => vscode.Uri.parse(change.uri).toString() === dependencyUri)) watchedNotifications++;
      });
    };
    client.sendNotification = observedSend;
    listeners.push({ dispose() { if (client.sendNotification === observedSend) client.sendNotification = originalSend; } });
  }
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
  async function observe(requireApplication, afterEvent, previousId) {
    const snapshot = document;
    const version = snapshot.version;
    const diagnosticsProvider = await provider();
    const deadline = Date.now() + 30_000;
    let report;
    do {
      const cancellation = new vscode.CancellationTokenSource();
      try { report = await diagnosticsProvider.provideDiagnostics(snapshot, undefined, cancellation.token); }
      finally { cancellation.dispose(); }
      if (snapshot !== document || snapshot.isClosed || snapshot.version !== version) throw new Error('The diagnostic observation became obsolete.');
      if (!report || report.kind !== 'full' || typeof report.resultId !== 'string' || report.resultId === '') {
        throw new Error('The native diagnostic report has no current opaque analysis identity.');
      }
      if (previousId === undefined || report.resultId !== previousId) break;
      if (Date.now() >= deadline) throw new Error('The native diagnostic report did not advance after the real document or dependency notification.');
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (true);
    resultId = report.resultId;
    const expected = report.items.map(diagnosticPacket);
    if (requireApplication || expected.length > 0) {
      await until(() => applied.some(event => event.number > afterEvent && event.version === version
        && sameDiagnostics(event.diagnostics, expected)) && sameDiagnostics(currentDiagnostics(), expected),
      'The current native diagnostic report was not applied to the editor collection.');
    }
    return observation();
  }
  async function observation() {
    return { uri: document.uri.toString(), text: document.getText(), version: document.version, initialVersion, resultId, dirty: document.isDirty,
      savedText: document.uri.scheme === 'file' ? await fs.readFile(document.uri.fsPath, 'utf8') : null,
      previousProblemCount, diagnostics: currentDiagnostics(), closed: tabClosed };
  }
  async function close() {
    if (!tabClosed) {
      previousProblemCount = currentDiagnostics().length;
      const afterEvent = eventNumber;
      const deadline = Date.now() + 30_000;
      await beforeDeadline(vscode.window.showTextDocument(document), deadline, 'The owned native editor did not activate before its cleanup deadline.');
      if (document.uri.scheme === 'untitled') {
        // Discard only this test-owned unsaved buffer. Empty unassociated untitled
        // documents are clean in VS Code, so explicit tab closure cannot prompt.
        if (document.getText() !== '') {
          const edit = new vscode.WorkspaceEdit();
          edit.set(document.uri, [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), '')]);
          if (!await beforeDeadline(vscode.workspace.applyEdit(edit), deadline, 'Discarding the owned untitled text did not finish before its cleanup deadline.')) {
            throw new Error('VS Code refused to discard the owned untitled text.');
          }
          // The tab model is the native close-confirmation authority. Untitled
          // TextDocument.isDirty can lag its model's dirty-state notification.
          await until(() => document.getText() === '' && vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(ownsTab).every(tab => !tab.isDirty),
            () => 'The owned untitled tabs did not become clean. ' + JSON.stringify({
              uri: document.uri.toString(), textLength: document.getText().length, documentDirty: document.isDirty,
              tabs: vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(ownsTab).map(tab => ({ isDirty: tab.isDirty })),
            }), deadline);
        }
        const ownedTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(ownsTab);
        if (!await beforeDeadline(vscode.window.tabGroups.close(ownedTabs, true), deadline, 'The owned native tab close did not finish before its cleanup deadline.')) {
          throw new Error('VS Code refused to close the owned native tabs.');
        }
      } else {
        await beforeDeadline(vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'), deadline,
          'The owned native discard command did not finish before its cleanup deadline.');
      }
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
      }), deadline);
    }
    return observation();
  }
  try {
    document = setup.untitled
      ? await vscode.workspace.openTextDocument({ language: 'expec', content: setup.text })
      : await vscode.workspace.openTextDocument(vscode.Uri.file(setup.file));
    await vscode.window.showTextDocument(document);
    await until(() => opened.get(document) === document.version, 'The native document open was not synchronized.');
    initialVersion = document.version;
    await until(() => dependencyRegistered, 'The native dependency watcher was not registered for the owned file.');
    if (setup.dependencyFile) await preparedWorkspaceWatch(vscode, setup.dependencyFile);
    await observe(false, 0);
    return {
      observation,
      async edit(texts) {
        if (disposed || tabClosed || document.isClosed) throw new Error('The owned native document is closed.');
        previousProblemCount = currentDiagnostics().length;
        const afterEvent = eventNumber;
        const previousId = resultId;
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
        return observe(true, afterEvent, previousId);
      },
      async changeDependency(text) {
        if (!setup.dependencyFile || disposed || tabClosed) throw new Error('No live test-owned dependency file.');
        previousProblemCount = currentDiagnostics().length;
        const afterEvent = eventNumber;
        const previousId = resultId;
        const previousNotifications = watchedNotifications;
        const dependency = vscode.Uri.file(setup.dependencyFile);
        if (text === null) await vscode.workspace.fs.delete(dependency);
        else await vscode.workspace.fs.writeFile(dependency, Buffer.from(text, 'utf8'));
        await until(() => watchedNotifications > previousNotifications, () => 'The native client did not send the actual owned dependency file event. ' + JSON.stringify({ dependency: vscode.Uri.file(setup.dependencyFile).toString(), dependencyRegistered, previousNotifications, watchedNotifications, sentFileChanges }));
        return observe(true, afterEvent, previousId);
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
async function until(predicate, explanation, deadline = Date.now() + 30_000) {
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(typeof explanation === 'function' ? explanation() : explanation);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function beforeDeadline(operation, deadline, explanation) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(explanation)), Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}
// GIVEN setup needs an operational native folder watch, not just the SDK's
// registration acknowledgment. The probe never changes the authored dependency.
async function preparedWorkspaceWatch(vscode, dependencyFile) {
  const folder = vscode.Uri.file(dirname(dependencyFile));
  const probe = vscode.Uri.file(join(dirname(dependencyFile), '.expec-native-watch-ready'));
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '.expec-native-watch-ready'));
  let observed = false;
  let complete;
  const ready = new Promise(resolve => { complete = resolve; });
  const receive = uri => { if (uri.toString() === probe.toString()) { observed = true; complete(); } };
  const subscriptions = [watcher.onDidCreate(receive), watcher.onDidChange(receive)];
  const deadline = Date.now() + 30_000;
  try {
    for (let attempt = 0; !observed; attempt++) {
      await vscode.workspace.fs.writeFile(probe, Buffer.from(String(attempt)));
      await Promise.race([ready, new Promise(resolve => setTimeout(resolve, 100))]);
      if (!observed && Date.now() >= deadline) throw new Error('The owned workspace folder did not establish actual native file feedback.');
    }
  } finally {
    for (const subscription of subscriptions) subscription.dispose();
    watcher.dispose();
    await fs.rm(probe.fsPath, { force: true });
  }
}

exports.preparedWorkspaceWatch = preparedWorkspaceWatch;

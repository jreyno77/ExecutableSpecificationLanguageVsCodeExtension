// Observe the installed product through standard providers/commands, never a copied target.
exports.openSourceDefinition = async function openSourceDefinition(vscode, extensionId, files) {
  const client = await vscode.extensions.getExtension(extensionId)?.activate();
  if (!client || typeof client.getFeature !== 'function') throw new Error('The installed extension did not export its native language client.');
  const subscriptions = [];
  const opened = new WeakMap();
  const changed = new WeakMap();
  const documents = new Map();
  const ownedUris = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, vscode.Uri.file(file).toString()]));
  let entry;
  let imported;
  let entryReport;
  let locations = [];
  let disposed = false;
  subscriptions.push(client.getFeature('textDocument/didOpen').onNotificationSent(event => opened.set(event.textDocument, event.params.textDocument.version)));
  subscriptions.push(client.getFeature('textDocument/didChange').onNotificationSent(event => changed.set(event.textDocument, event.params.textDocument.version)));

  async function openOwned(name) {
    if (!files[name]) throw new Error('The owned definition source is unavailable.');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(files[name]));
    documents.set(name, document);
    await until(() => opened.get(document) === document.version, 'The actual native source open was not synchronized.');
    return document;
  }
  async function currentReport(document, previousId) {
    let provider;
    await until(() => (provider = client.getFeature('textDocument/diagnostic').getProvider(document)?.diagnostics), 'The native diagnostic provider is unavailable.');
    const version = document.version;
    const deadline = Date.now() + 30_000;
    while (true) {
      const cancellation = new vscode.CancellationTokenSource();
      let report;
      try { report = await provider.provideDiagnostics(document, undefined, cancellation.token); }
      catch (error) { if (!(error instanceof vscode.CancellationError)) throw error; }
      finally { cancellation.dispose(); }
      if (document.isClosed || document.version !== version) throw new Error('The native analysis observation became obsolete.');
      if (report?.kind === 'full' && typeof report.resultId === 'string' && report.resultId !== '' && report.resultId !== previousId) {
        if (report.items.length) await until(() => sameDiagnostics(vscode.languages.getDiagnostics(document.uri), report.items), 'The current native problems were not applied.', deadline);
        return report;
      }
      if (Date.now() >= deadline) throw new Error('The actual native analysis identity did not advance.');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  async function replace(document, text) {
    const edit = new vscode.WorkspaceEdit();
    const edits = [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text)];
    const newline = text.match(/\r?\n/);
    if (newline) edits.push(vscode.TextEdit.setEndOfLine(newline[0] === '\r\n' ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF));
    edit.set(document.uri, edits);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code refused the owned unsaved definition edit.');
    await until(() => changed.get(document) === document.version, 'The actual native source edit was not synchronized.');
  }
  function observation() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !entryReport) throw new Error('The native definition observation has no current editor/report.');
    return { entryUri: entry.uri.toString(), entryVersion: entry.version, resultId: entryReport.resultId,
      ownedUris, entryDirty: entry.isDirty, importDirty: imported?.isDirty ?? false,
      locations, active: { uri: editor.document.uri.toString(), line: editor.selection.active.line, character: editor.selection.active.character },
      problemCodes: vscode.languages.getDiagnostics(entry.uri).map(diagnostic => {
        const code = typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code;
        return code === undefined ? '' : String(code);
      }) };
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    const failures = [];
    for (const document of documents.values()) {
      try {
        const uri = document.uri.toString();
        const owns = tab => tab.input?.uri?.toString() === uri;
        const buffers = () => vscode.workspace.textDocuments.filter(actual => actual.uri.toString() === uri);
        const current = buffers().find(actual => !actual.isClosed);
        if (current?.isDirty || vscode.window.tabGroups.all.some(group => group.tabs.some(owns))) {
          await vscode.window.showTextDocument(current ?? document);
          await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        }
        await until(() => buffers().every(actual => !actual.isDirty)
          && !vscode.window.tabGroups.all.some(group => group.tabs.some(owns))
          && !vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === uri),
        'The owned native definition buffers/tabs did not become clean and close.');
      } catch (error) { failures.push(error); }
    }
    for (const subscription of subscriptions) { try { subscription.dispose(); } catch (error) { failures.push(error); } }
    if (failures.length) throw new AggregateError(failures, 'Native definition cleanup unconfirmed.', { cause: failures[0] });
  }
  try {
    entry = await openOwned('entry.expec');
    await vscode.window.showTextDocument(entry);
    entryReport = await currentReport(entry);
    return {
      observation,
      async edit(kind, text) {
        if (disposed) throw new Error('The native definition case is disposed.');
        if (kind === 'entry') {
          const before = entryReport.resultId;
          await replace(entry, text);
          entryReport = await currentReport(entry, before);
        } else if (kind === 'import') {
          imported ??= await openOwned('book.expec');
          const importedReport = await currentReport(imported);
          entryReport = await currentReport(entry);
          const before = entryReport.resultId;
          await replace(imported, text);
          await currentReport(imported, importedReport.resultId);
          entryReport = await currentReport(entry, before);
        } else throw new Error('Unknown owned definition edit.');
        return observation();
      },
      async goTo(line, character) {
        if (disposed) throw new Error('The native definition case is disposed.');
        const editor = await vscode.window.showTextDocument(entry);
        const position = new vscode.Position(line, character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
        const returned = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', entry.uri, position);
        locations = [];
        for (const value of returned ?? []) {
          const uri = value.targetUri ?? value.uri;
          const range = value.targetSelectionRange ?? value.range;
          if (!uri || !range) throw new Error('The real definition provider returned an invalid native location.');
          const target = await vscode.workspace.openTextDocument(uri);
          if (Object.values(ownedUris).includes(target.uri.toString())) {
            const name = Object.entries(ownedUris).find(([, owned]) => owned === target.uri.toString())[0];
            documents.set(name, target);
          }
          locations.push({ uri: uri.toString(), name: target.getText(range),
            range: { start: { line: range.start.line, character: range.start.character }, end: { line: range.end.line, character: range.end.character } } });
        }
        await vscode.commands.executeCommand('editor.action.revealDefinition');
        if (locations.length === 1) await until(() => {
          const active = vscode.window.activeTextEditor;
          return active?.document.uri.toString() === locations[0].uri && active.selection.active.line === locations[0].range.start.line
            && active.selection.active.character === locations[0].range.start.character;
        }, 'The standard Go to Definition command did not reveal its actual provider target.');
        return observation();
      },
      dispose,
    };
  } catch (error) {
    try { await dispose(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Native definition setup and cleanup failed.', { cause: error }); }
    throw error;
  }
};
function sameDiagnostics(left, right) {
  const packet = value => ({ message: value.message, code: typeof value.code === 'object' ? value.code.value : value.code,
    start: { line: value.range.start.line, character: value.range.start.character }, end: { line: value.range.end.line, character: value.range.end.character } });
  return JSON.stringify(left.map(packet)) === JSON.stringify(right.map(packet));
}
async function until(predicate, explanation, deadline = Date.now() + 30_000) {
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(explanation);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

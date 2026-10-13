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
  let completions;
  let referenceRequest;
  let referenceCancellation;
  let referenceSequence = 0;
  const pendingReferences = new Set();
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
  function completionObserver() {
    return completions ??= require('./source-completion.cjs').observeCompletions(vscode, client, entry, async () => {
      const before = entryReport.resultId;
      await until(() => changed.get(entry) === entry.version, 'The actual completion edit was not synchronized.');
      entryReport = await currentReport(entry, before);
    });
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
  async function referenceObservation() {
    const request = referenceRequest;
    if (disposed || !request) throw new Error('No current owned reference request exists.');
    for (const snapshot of request.documents) {
      if (snapshot.document.isClosed || snapshot.document.version !== snapshot.version
        || !vscode.workspace.textDocuments.some(document => document === snapshot.document))
        throw new Error('A captured native reference document became obsolete.');
    }
    const report = await currentReport(entry);
    if (disposed || referenceRequest !== request || report.resultId !== request.resultId
      || entry.version !== request.version || entry.getText() !== request.text)
      throw new Error('The actual native reference analysis became obsolete.');
    entryReport = report;
    return { ...observation(), locations: request.locations, requestUri: entry.uri.toString(), requestVersion: request.version,
      requestResultId: request.resultId, requestPosition: request.position, includeDeclaration: false };
  }
  function references(line, character) {
    const operation = requestReferences(line, character);
    pendingReferences.add(operation);
    void operation.then(() => pendingReferences.delete(operation), () => pendingReferences.delete(operation));
    return operation;
  }
  async function requestReferences(line, character) {
    if (disposed) throw new Error('The native reference case is disposed.');
    referenceRequest = undefined;
    const sequence = ++referenceSequence;
    await vscode.window.showTextDocument(entry);
    entryReport = await currentReport(entry);
    const version = entry.version, text = entry.getText(), resultId = entryReport.resultId;
    const snapshots = [...documents.values()].map(document => ({ document, version: document.version }));
    let provider;
    await until(() => (provider = client.getFeature('textDocument/references').getProvider(entry)), 'The installed native references provider is unavailable.');
    if (disposed || referenceSequence !== sequence || entry.isClosed || entry.version !== version || entry.getText() !== text)
      throw new Error('The native reference request became obsolete before provider dispatch.');
    const cancellation = referenceCancellation = new vscode.CancellationTokenSource();
    let returned;
    try { returned = await provider.provideReferences(entry, new vscode.Position(line, character), { includeDeclaration: false }, cancellation.token); }
    finally { if (referenceCancellation === cancellation) referenceCancellation = undefined; cancellation.dispose(); }
    if (disposed || referenceSequence !== sequence || entry.isClosed || entry.version !== version || entry.getText() !== text
      || snapshots.some(snapshot => snapshot.document.isClosed || snapshot.document.version !== snapshot.version))
      throw new Error('The native reference response became obsolete.');
    if (returned !== undefined && returned !== null && !Array.isArray(returned)) throw new Error('The installed reference provider returned an invalid list.');
    const actualLocations = [];
    for (const value of returned ?? []) {
      if (!(value.uri instanceof vscode.Uri) || !(value.range instanceof vscode.Range)) throw new Error('The installed reference provider returned an invalid Location.');
      const target = await vscode.workspace.openTextDocument(value.uri);
      if (disposed || referenceSequence !== sequence) throw new Error('The owned native reference case ended during location acquisition.');
      const owned = Object.entries(ownedUris).find(([, uri]) => uri === target.uri.toString());
      if (owned) documents.set(owned[0], target);
      if (target.validateRange(value.range).start.compareTo(value.range.start) !== 0
        || target.validateRange(value.range).end.compareTo(value.range.end) !== 0 || value.range.isEmpty)
        throw new Error('The installed reference provider returned a range outside its actual native document.');
      actualLocations.push({ uri: value.uri.toString(), name: target.getText(value.range),
        range: { start: { line: value.range.start.line, character: value.range.start.character },
          end: { line: value.range.end.line, character: value.range.end.character } } });
    }
    referenceRequest = { version, text, resultId, position: { line, character }, documents: snapshots, locations: actualLocations };
    return referenceObservation();
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    referenceSequence++;
    referenceCancellation?.cancel(); referenceCancellation?.dispose(); referenceCancellation = undefined;
    referenceRequest = undefined;
    const failures = [];
    await Promise.allSettled([...pendingReferences]);
    if (completions) { try { await completions.dispose(); } catch (error) { failures.push(error); } }
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
      references,
      referenceObservation,
      async completion(line, character) {
        if (disposed) throw new Error('The native completion case is disposed.');
        const actual = await completionObserver().request(line, character);
        return { ...observation(), ...actual };
      },
      async applyCompletion(request, index) {
        if (disposed) throw new Error('The native completion case is disposed.');
        const actual = await completionObserver().apply(request, index);
        return { ...observation(), ...actual };
      },
      async symbols() {
        if (disposed) throw new Error('The native source case is disposed.');
        const returned = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', entry.uri);
        const nativeRange = range => ({ start: { line: range.start.line, character: range.start.character }, end: { line: range.end.line, character: range.end.character } });
        const record = symbol => {
          if (!symbol.range || !symbol.selectionRange || typeof symbol.name !== 'string' || !Number.isInteger(symbol.kind)) {
            throw new Error('The real native symbol provider did not return a hierarchical DocumentSymbol.');
          }
          const kind = Object.entries(vscode.SymbolKind).find(([name, value]) => typeof name === 'string' && value === symbol.kind)?.[0];
          if (!kind || (symbol.children !== undefined && !Array.isArray(symbol.children))) throw new Error('The real native symbol provider returned an invalid kind or children.');
          return { name: symbol.name, kind, range: nativeRange(symbol.range), selectionRange: nativeRange(symbol.selectionRange),
            children: (symbol.children ?? []).map(record) };
        };
        if (returned !== undefined && !Array.isArray(returned)) throw new Error('The native symbol provider returned an invalid list.');
        return { ...observation(), entryText: entry.getText(), symbols: (returned ?? []).map(record) };
      },
      async hover(line, character) {
        if (disposed) throw new Error('The native source case is disposed.');
        const returned = await vscode.commands.executeCommand('vscode.executeHoverProvider', entry.uri, new vscode.Position(line, character));
        const hovers = (returned ?? []).map(hover => {
          if (!hover.range || !Array.isArray(hover.contents) || !hover.contents.every(content => typeof content.value === 'string')) {
            throw new Error('The actual native hover provider returned an invalid range/content.');
          }
          return { markdown: hover.contents.map(content => content.value).join('\n\n'), name: entry.getText(hover.range),
            range: { start: { line: hover.range.start.line, character: hover.range.start.character },
              end: { line: hover.range.end.line, character: hover.range.end.character } } };
        });
        return { ...observation(), hovers };
      },
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

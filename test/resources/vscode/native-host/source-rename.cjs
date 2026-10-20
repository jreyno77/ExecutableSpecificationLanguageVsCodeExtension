// Uses this installed LanguageClient's standard provider and VS Code's actual applyEdit.
exports.openSourceRename = async function openSourceRename(vscode, extensionId, setup) {
  const client = await vscode.extensions.getExtension(extensionId)?.activate();
  if (!client || typeof client.getFeature !== 'function') throw new Error('The installed extension did not export its actual LanguageClient.');
  const connection = client.connectionTreeProvider;
  if (!connection || typeof connection.start !== 'function' || typeof connection.getChildren !== 'function'
    || typeof connection.getTreeItem !== 'function') throw new Error('The actual native configuration provider is unavailable.');
  const previous = (await connection.getChildren())?.[0]?.configurationFile;
  const resetFile = typeof previous === 'string' && previous !== '' ? previous : setup.resetFile;
  const opened = new WeakMap(), changed = new WeakMap(), documents = new Map();
  const subscriptions = [
    client.getFeature('textDocument/didOpen').onNotificationSent(event => opened.set(event.textDocument, event.params.textDocument.version)),
    client.getFeature('textDocument/didChange').onNotificationSent(event => changed.set(event.textDocument, event.params.textDocument.version)),
  ];
  let book, basket, placeholder = '', refused = false, explanation = '', disposed = false;
  async function selected(configurationFile, connected) {
    await until(async () => {
      const children = await connection.getChildren();
      if (!Array.isArray(children) || children.length !== 1 || children[0].configurationFile !== configurationFile) return false;
      const status = (await connection.getTreeItem(children[0])).contextValue;
      return connected ? status === 'connected' : status !== 'checking';
    }, 'The actual native rename configuration selection did not settle.');
  }
  async function open(file) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    documents.set(document.uri.toString(), document);
    await until(() => opened.get(document) === document.version, 'The owned rename document open was not synchronized.');
    return document;
  }
  async function currentReport(document) {
    let provider;
    await until(() => (provider = client.getFeature('textDocument/diagnostic').getProvider(document)?.diagnostics),
      'The actual native rename diagnostic provider is unavailable.');
    const version = document.version, deadline = Date.now() + 30_000;
    while (true) {
      const cancellation = new vscode.CancellationTokenSource();
      let report;
      try { report = await provider.provideDiagnostics(document, undefined, cancellation.token); }
      catch (error) { if (!(error instanceof vscode.CancellationError)) throw error; }
      finally { cancellation.dispose(); }
      if (document.isClosed || document.version !== version) throw new Error('The native rename analysis became obsolete.');
      if (report?.kind === 'full' && typeof report.resultId === 'string' && report.resultId !== '') return;
      if (Date.now() >= deadline) throw new Error('The native rename analysis did not become current.');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  function documentState(document) {
    if (document.isClosed) throw new Error('An owned native rename buffer unexpectedly closed.');
    return { uri: document.uri.toString(), version: document.version, text: document.getText(), dirty: document.isDirty };
  }
  function observation() { return { book: documentState(book), basket: documentState(basket), placeholder, refused, explanation }; }
  async function provider() {
    await currentReport(book); await currentReport(basket);
    const actual = client.getFeature('textDocument/rename').getProvider(book);
    // Missing registration is the behavioral baseline, not an invented refusal or aggregate fallback.
    if (!actual || typeof actual.provideRenameEdits !== 'function') throw new Error('The installed extension native rename provider is unavailable.');
    return actual;
  }
  function position(line, character) {
    const actual = new vscode.Position(line, character);
    if (!book.validatePosition(actual).isEqual(actual)) throw new Error('The authored rename position is outside the actual document.');
    return actual;
  }
  async function dispose() {
    if (disposed) return;
    const failures = [];
    for (const document of documents.values()) {
      try {
        const uri = document.uri.toString(), owns = tab => tab.input?.uri?.toString() === uri;
        const buffers = () => vscode.workspace.textDocuments.filter(actual => actual.uri.toString() === uri);
        const current = buffers().find(actual => !actual.isClosed);
        if (current?.isDirty || vscode.window.tabGroups.all.some(group => group.tabs.some(owns))) {
          await vscode.window.showTextDocument(current ?? document, { preview: false });
          await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        }
        await until(() => buffers().every(actual => !actual.isDirty)
          && !vscode.window.tabGroups.all.some(group => group.tabs.some(owns))
          && !vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === uri),
        'The owned rename buffers/tabs did not become clean and close.');
      } catch (error) { failures.push(error); }
    }
    try { connection.start(resetFile); await selected(resetFile, false); } catch (error) { failures.push(error); }
    for (const subscription of subscriptions) { try { subscription.dispose(); } catch (error) { failures.push(error); } }
    disposed = failures.length === 0;
    if (failures.length) throw new AggregateError(failures, 'Native rename cleanup unconfirmed.', { cause: failures[0] });
  }
  try {
    connection.start(setup.configurationFile); await selected(setup.configurationFile, true);
    await vscode.commands.executeCommand('expec.disableGenerationOnSave');
    book = await open(setup.book); basket = await open(setup.basket);
    await vscode.window.showTextDocument(book, { preview: false });
    await currentReport(book); await currentReport(basket);
    return {
      observation, dispose,
      async prepare(line, character) {
        if (disposed) throw new Error('The native rename case is disposed.');
        const actual = await provider();
        if (typeof actual.prepareRename !== 'function') throw new Error('The installed extension native prepareRename provider is unavailable.');
        const cancellation = new vscode.CancellationTokenSource();
        let prepared;
        try { prepared = await actual.prepareRename(book, position(line, character), cancellation.token); }
        finally { cancellation.dispose(); }
        const range = prepared instanceof vscode.Range ? prepared : prepared?.range;
        if (!(range instanceof vscode.Range) || range.isEmpty || !book.validateRange(range).isEqual(range))
          throw new Error('The actual native prepareRename result has no whole token range.');
        placeholder = prepared instanceof vscode.Range ? book.getText(range) : prepared.placeholder;
        if (typeof placeholder !== 'string') throw new Error('The actual native prepareRename result has no placeholder.');
        return observation();
      },
      async rename(line, character, newName) {
        if (disposed) throw new Error('The native rename case is disposed.');
        const actual = await provider(), cancellation = new vscode.CancellationTokenSource();
        refused = false; explanation = '';
        let edit;
        try { edit = await actual.provideRenameEdits(book, position(line, character), newName, cancellation.token); }
        catch (error) { refused = true; explanation = String(error.message ?? error); return observation(); }
        finally { cancellation.dispose(); }
        if (edit === undefined || edit === null) { refused = true; return observation(); }
        if (!(edit instanceof vscode.WorkspaceEdit)) throw new Error('The native rename provider did not return an actual WorkspaceEdit.');
        if (!await vscode.workspace.applyEdit(edit)) { refused = true; explanation = 'VS Code refused the returned rename edit.'; }
        await until(() => [...documents.values()].every(document => (changed.get(document) ?? opened.get(document)) === document.version),
          'The actual native rename buffer edits did not synchronize.');
        return observation();
      },
    };
  } catch (error) {
    try { await dispose(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Native rename setup and cleanup failed.', { cause: error }); }
    throw error;
  }
};
async function until(condition, message, deadline = Date.now() + 30_000) {
  while (!await condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

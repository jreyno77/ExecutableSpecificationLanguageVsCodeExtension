// Observe only this installed client's real completion contribution.
exports.observeCompletions = function observeCompletions(vscode, client, entry, currentReport) {
  const middleware = client.clientOptions.middleware;
  if (!middleware || typeof middleware !== 'object') throw new Error('The installed client has no public middleware object.');
  const previous = middleware.provideCompletionItem;
  const pending = new Set();
  const requests = [];
  let active;
  let disposed = false;
  function track(action) {
    const operation = Promise.resolve().then(action);
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }
  const wrapped = (document, position, context, token, next) => {
    const request = active;
    const owned = request && document === entry && document.version === request.version
      && position.line === request.position.line && position.character === request.position.character;
    if (owned) request.calls++;
    return track(async () => {
      try {
        const reply = await (previous ? previous(document, position, context, token, next) : next(document, position, context, token));
        if (owned) request.contribution = reply;
        return reply;
      } catch (error) {
        if (owned) { request.failed = true; request.failure = error; }
        throw error;
      }
    });
  };
  middleware.provideCompletionItem = wrapped;
  const position = actual => ({ line: actual.line, character: actual.character });
  const range = actual => ({ start: position(actual.start), end: position(actual.end) });
  function items(reply) {
    if (reply === undefined || reply === null) return [];
    const actual = Array.isArray(reply) ? reply : reply.items;
    if (!Array.isArray(actual)) throw new Error('The actual owned completion contribution was not an array or CompletionList.');
    return actual;
  }
  function item(actual) {
    const label = typeof actual.label === 'string' ? actual.label : actual.label?.label;
    if (typeof label !== 'string' || typeof actual.insertText !== 'string' || !(actual.range instanceof vscode.Range))
      throw new Error('The actual native completion did not return a plain label/string insertion/Range.');
    return { label, insertion: actual.insertText, range: range(actual.range) };
  }
  return {
    request(line, character) {
      if (disposed || active) return Promise.reject(new Error('The owned completion observer is disposed or already requesting.'));
      const request = { document: entry, version: entry.version, position: new vscode.Position(line, character), calls: 0 };
      active = request;
      return track(async () => {
        try {
          // Preserve the unfiltered aggregate separately from this client's contribution.
          request.aggregate = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', entry.uri, request.position);
          if (request.failed) throw request.failure;
          if (request.calls !== 1) throw new Error('The installed owned completion provider ran ' + request.calls + ' times instead of once.');
          if (entry.isClosed || entry.version !== request.version
            || !vscode.workspace.textDocuments.some(document => document === entry))
            throw new Error('The completion observation became obsolete.');
          request.nativeItems = items(request.contribution);
          request.items = request.nativeItems.map(item);
          requests.push(request);
          return { items: request.items, aggregate: request.aggregate, entryText: entry.getText(),
            requestUri: request.document.uri.toString(), requestVersion: request.version, requestPosition: position(request.position) };
        } finally { active = undefined; }
      });
    },
    apply(requestNumber, itemIndex) {
      return track(async () => {
        if (disposed || !Number.isInteger(requestNumber) || !Number.isInteger(itemIndex) || requestNumber < 1 || itemIndex < 1)
          throw new Error('The owned completion edit needs an existing request and positive item index.');
        const requested = requests[requestNumber - 1];
        const actual = requested?.nativeItems[itemIndex - 1];
        if (!actual) throw new Error('No actual native suggestion was retained for this request/index.');
        if (entry !== requested.document || entry.isClosed || entry.version !== requested.version
          || !vscode.workspace.textDocuments.some(document => document === entry))
          throw new Error('The actual native suggestion belongs to an obsolete document snapshot.');
        const before = entry.version;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(entry.uri, actual.range, actual.insertText);
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code refused the retained native suggestion edit.');
        await currentReport();
        if (entry.version <= before) throw new Error('The real completion edit did not advance its document version.');
        return { entryText: entry.getText() };
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const results = await Promise.allSettled([...pending]);
      if (middleware.provideCompletionItem === wrapped) middleware.provideCompletionItem = previous;
      const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures, 'Owned completion observations did not settle cleanly.', { cause: failures[0] });
    },
  };
};

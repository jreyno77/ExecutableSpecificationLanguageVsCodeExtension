const fs = require('node:fs/promises');
const net = require('node:net');

// A distinct test extension runs observations; the product remains installed from its VSIX.
exports.run = async function run() {
  const vscode = require('vscode');
  const { openDiagnosticDocument } = require('./diagnostic-document.cjs');
  const diagnosticDocuments = new Map();
  const { openSourceDefinition } = require('./source-definition.cjs');
  const sourceDefinitions = new Map();
  const { openConnectionSidebar } = require('./connection-sidebar.cjs');
  const connectionSidebars = new Map();
  const { openPreviewEditor } = require('./preview-editor.cjs');
  const previewEditors = new Map();
  const { openGenerationEditor } = require('./generation-editor.cjs');
  const generationEditors = new Map();
  const request = JSON.parse(await fs.readFile(process.env.EXPEC_NATIVE_REQUEST, 'utf8'));
  const socket = net.createConnection({ host: '127.0.0.1', port: request.port });
  await new Promise((resolveRun, rejectRun) => {
    let buffer = '';
    let queue = Promise.resolve();
    let shuttingDown = false;
    const send = frame => new Promise((resolveWrite, reject) => socket.write(
      JSON.stringify({ token: request.token, ...frame }) + '\n', error => error ? reject(error) : resolveWrite(),
    ));
    const observe = async frame => {
      if (frame.token !== request.token || typeof frame.id !== 'string') throw new Error('Invalid native request identity.');
      let value;
      try {
        if (frame.operation === 'readDocument' && typeof frame.file === 'string') {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(frame.file));
          value = { file: document.uri.fsPath, text: document.getText(), languageId: document.languageId };

        } else if (frame.operation === 'extensionPath' && typeof frame.extensionId === 'string') {
          value = vscode.extensions.getExtension(frame.extensionId)?.extensionPath ?? null;
        } else if (frame.operation === 'missingDocumentDiagnostics' && typeof frame.extensionId === 'string') {
          const client = await vscode.extensions.getExtension(frame.extensionId)?.activate();
          const provide = client?.clientOptions.middleware?.provideDiagnostics;
          if (typeof provide !== 'function') throw new Error('The installed product has no diagnostic middleware.');
          const uri = vscode.Uri.parse('untitled:missing-native-document-' + frame.id + '.expec');
          if (vscode.workspace.textDocuments.some(document => document.uri.toString() === uri.toString())) {
            throw new Error('The missing diagnostic document unexpectedly exists.');
          }
          const cancellation = new vscode.CancellationTokenSource();
          let nextCalls = 0;
          const runtime = { node: process.versions.node, vscode: vscode.version };
          try {
            await provide(uri, undefined, cancellation.token, async () => { nextCalls++; return { kind: 'full', items: [] }; });
            value = { cancellationError: false, nextCalls, runtime };
          } catch (error) { value = { cancellationError: error instanceof vscode.CancellationError, nextCalls, runtime }; }
          finally { cancellation.dispose(); }
        } else if (frame.operation === 'definitionOpen' && typeof frame.definitionId === 'string' && typeof frame.extensionId === 'string'
          && frame.files && typeof frame.files === 'object' && typeof frame.files['entry.expec'] === 'string'
          && Object.values(frame.files).every(file => typeof file === 'string')) {
          if (sourceDefinitions.has(frame.definitionId)) throw new Error('The owned definition case already exists.');
          const definition = await openSourceDefinition(vscode, frame.extensionId, frame.files);
          sourceDefinitions.set(frame.definitionId, definition);
          value = definition.observation();
        } else if (['definitionEdit', 'definitionGoTo', 'definitionDispose'].includes(frame.operation) && typeof frame.definitionId === 'string') {
          const definition = sourceDefinitions.get(frame.definitionId);
          if (frame.operation === 'definitionDispose' && !definition) value = null;
          else {
            if (!definition) throw new Error('The owned definition case is unavailable.');
            if (frame.operation === 'definitionEdit' && ['entry', 'import'].includes(frame.kind) && typeof frame.text === 'string') {
              value = await definition.edit(frame.kind, frame.text);
            } else if (frame.operation === 'definitionGoTo' && Number.isInteger(frame.line) && frame.line >= 0
              && Number.isInteger(frame.character) && frame.character >= 0) value = await definition.goTo(frame.line, frame.character);
            else if (frame.operation === 'definitionDispose') {
              await definition.dispose(); sourceDefinitions.delete(frame.definitionId); value = null;
            } else throw new Error('Invalid owned definition operation.');
          }
        } else if (frame.operation === 'diagnosticOpen' && typeof frame.documentId === 'string' && typeof frame.extensionId === 'string'
          && typeof frame.text === 'string' && (frame.untitled === true || typeof frame.file === 'string')) {
          if (diagnosticDocuments.has(frame.documentId)) throw new Error('The owned native document already exists.');
          const document = await openDiagnosticDocument(vscode, frame.extensionId, frame);
          diagnosticDocuments.set(frame.documentId, document);
          value = await document.observation();
        } else if (['diagnosticEdit', 'diagnosticObserve', 'diagnosticClose', 'diagnosticDispose', 'diagnosticDependency'].includes(frame.operation)
          && typeof frame.documentId === 'string') {
          const document = diagnosticDocuments.get(frame.documentId);
          if (frame.operation === 'diagnosticDispose' && !document) value = null;
          else {
            if (!document) throw new Error('The owned native document is unavailable.');
            if (frame.operation === 'diagnosticEdit' && Array.isArray(frame.texts) && frame.texts.length > 0
              && frame.texts.every(text => typeof text === 'string')) value = await document.edit(frame.texts);
            else if (frame.operation === 'diagnosticDependency' && (frame.text === null || typeof frame.text === 'string')) value = await document.changeDependency(frame.text);
            else if (frame.operation === 'diagnosticObserve') value = await document.observation();
            else if (frame.operation === 'diagnosticClose') value = await document.close();
            else if (frame.operation === 'diagnosticDispose') {
              await document.dispose(); diagnosticDocuments.delete(frame.documentId); value = null;
            } else throw new Error('Invalid native document operation.');
          }
        } else if (frame.operation === 'sidebarOpen' && typeof frame.sidebarId === 'string' && typeof frame.extensionId === 'string'
          && typeof frame.file === 'string' && typeof frame.directory === 'string' && typeof frame.resetFile === 'string') {
          if (connectionSidebars.has(frame.sidebarId)) throw new Error('The owned native sidebar case already exists.');
          const sidebar = await openConnectionSidebar(vscode, frame.extensionId, frame);
          connectionSidebars.set(frame.sidebarId, sidebar);
          value = await sidebar.observation();
        } else if (['sidebarObserve', 'sidebarAction', 'sidebarDispose'].includes(frame.operation) && typeof frame.sidebarId === 'string') {
          const sidebar = connectionSidebars.get(frame.sidebarId);
          if (frame.operation === 'sidebarDispose' && !sidebar) value = null;
          else {
            if (!sidebar) throw new Error('The owned native sidebar case is unavailable.');
            if (frame.operation === 'sidebarObserve') value = await sidebar.observation();
            else if (frame.operation === 'sidebarAction' && ['choose', 'save', 'remove', 'restore', 'edit'].includes(frame.kind)
              && (['choose', 'remove', 'restore'].includes(frame.kind) ? typeof frame.name === 'string' : typeof frame.text === 'string')) {
              value = await sidebar.action(frame.kind, frame.name, frame.text);
            } else if (frame.operation === 'sidebarDispose') {
              await sidebar.dispose(); connectionSidebars.delete(frame.sidebarId); value = null;
            } else throw new Error('Invalid native sidebar operation.');
          }
        } else if (frame.operation === 'generationOpen' && typeof frame.generationId === 'string' && typeof frame.extensionId === 'string'
          && ['file', 'other', 'directory', 'workspace', 'configurationFile', 'resetFile', 'nodeExecutable'].every(key => typeof frame[key] === 'string')
          && typeof frame.enabled === 'boolean') {
          if (generationEditors.has(frame.generationId)) throw new Error('The owned native generation case already exists.');
          const editor = await openGenerationEditor(vscode, frame.extensionId, frame);
          generationEditors.set(frame.generationId, editor); value = await editor.observation();
        } else if (['generationAction', 'generationObserve', 'generationDispose'].includes(frame.operation) && typeof frame.generationId === 'string') {
          const editor = generationEditors.get(frame.generationId);
          if (frame.operation === 'generationDispose' && !editor) value = null;
          else {
            if (!editor) throw new Error('The owned native generation case is unavailable.');
            if (frame.operation === 'generationObserve') value = await editor.observation();
            else if (frame.operation === 'generationDispose') { await editor.dispose(); generationEditors.delete(frame.generationId); value = null; }
            else if (['edit', 'otherEdit', 'otherSave', 'keep', 'dirtyTarget'].includes(frame.kind) && typeof frame.text === 'string'
              && (!['keep', 'dirtyTarget'].includes(frame.kind) || typeof frame.file === 'string')) value = await editor.action(frame.kind, frame);
            else if (frame.kind === 'enable' && typeof frame.enabled === 'boolean') value = await editor.action(frame.kind, frame);
            else if (['save', 'selectOriginal', 'showLog'].includes(frame.kind)) value = await editor.action(frame.kind, frame);
            else if (frame.kind === 'selectOther' && ['file', 'other', 'directory', 'configurationFile'].every(key => typeof frame[key] === 'string')) value = await editor.action(frame.kind, frame);
            else throw new Error('Invalid actual generation editor action.');
          }
        } else if (frame.operation === 'previewOpen' && typeof frame.previewId === 'string' && typeof frame.extensionId === 'string'
          && typeof frame.file === 'string' && typeof frame.configurationFile === 'string' && typeof frame.resetFile === 'string') {
          if (previewEditors.has(frame.previewId)) throw new Error('The owned native preview case already exists.');
          const editor = await openPreviewEditor(vscode, frame.extensionId, frame);
          previewEditors.set(frame.previewId, editor); value = await editor.observation();
        } else if (['previewShow', 'previewEdit', 'previewSaveConfiguration', 'previewObserve', 'previewClosePanel', 'previewDispose'].includes(frame.operation)
          && typeof frame.previewId === 'string') {
          const editor = previewEditors.get(frame.previewId);
          if (frame.operation === 'previewDispose' && !editor) value = null;
          else {
            if (!editor) throw new Error('The owned native preview case is unavailable.');
            if (frame.operation === 'previewShow') value = await editor.show();
            else if (frame.operation === 'previewEdit' && typeof frame.text === 'string') value = await editor.edit(frame.text);
            else if (frame.operation === 'previewSaveConfiguration' && typeof frame.text === 'string') value = await editor.saveConfiguration(frame.text);
            else if (frame.operation === 'previewObserve') value = await editor.observation();
            else if (frame.operation === 'previewClosePanel') value = await editor.closePanel();
            else if (frame.operation === 'previewDispose') { await editor.dispose(); previewEditors.delete(frame.previewId); value = null; }
            else throw new Error('Invalid native preview operation.');
          }
        } else if (frame.operation === 'shutdown') {
          for (const editor of generationEditors.values()) await editor.dispose();
          generationEditors.clear();
          for (const editor of previewEditors.values()) await editor.dispose();
          previewEditors.clear();
          for (const document of diagnosticDocuments.values()) await document.dispose();
          diagnosticDocuments.clear();
          for (const definition of sourceDefinitions.values()) await definition.dispose();
          sourceDefinitions.clear();
          for (const sidebar of connectionSidebars.values()) await sidebar.dispose();
          connectionSidebars.clear();
          value = null; shuttingDown = true;
        } else throw new Error('Unsupported native observation.');
        await send({ kind: 'response', id: frame.id, value });
        if (shuttingDown) { socket.end(); resolveRun(); }
      } catch (error) {
        await send({ kind: 'response', id: frame.id, error: String(error.message ?? error) });
      }
    };
    socket.on('connect', () => { void send({ kind: 'ready' }).catch(rejectRun); });
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) { socket.destroy(); rejectRun(new Error('Native request exceeded its framing bound.')); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        queue = queue.then(() => observe(JSON.parse(line)));
        void queue.catch(error => { socket.destroy(); rejectRun(error); });
      }
    });
    socket.on('error', rejectRun);
    socket.on('close', () => { if (!shuttingDown) rejectRun(new Error('Native session disconnected before shutdown.')); });
  });
};

if (require.main === module) {
  (async () => {
    const { runTests, runVSCodeCommand, downloadAndUnzipVSCode } = require('@vscode/test-electron');
    const requestPath = process.argv[2];
    const request = JSON.parse(await fs.readFile(requestPath, 'utf8'));
    const profile = ['--extensions-dir', request.extensionsDirectory, '--user-data-dir', request.userDataDirectory];
    if (request.command === 'install') {
      const executable = await downloadAndUnzipVSCode({ version: request.version, cachePath: request.cachePath });
      await runVSCodeCommand([...profile, '--install-extension', request.packagePath, '--force'], {
        version: request.version, cachePath: request.cachePath,
      });
      await fs.writeFile(request.receiptPath, JSON.stringify({ executable }));
    } else if (request.command === 'session') {
      await runTests({
        vscodeExecutablePath: request.executable,
        extensionDevelopmentPath: __dirname, extensionTestsPath: __filename,
        launchArgs: [...profile, request.workspaceDirectory, '--disable-gpu', '--disable-telemetry', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
        extensionTestsEnv: { EXPEC_NATIVE_REQUEST: requestPath },
      });
    } else throw new Error('Unsupported owned launcher command.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

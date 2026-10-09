const fs = require('node:fs/promises');
const net = require('node:net');

// A distinct test extension runs observations; the product remains installed from its VSIX.
exports.run = async function run() {
  const vscode = require('vscode');
  const { openDiagnosticDocument } = require('./diagnostic-document.cjs');
  const diagnosticDocuments = new Map();
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
        } else if (frame.operation === 'shutdown') {
          for (const document of diagnosticDocuments.values()) await document.dispose();
          diagnosticDocuments.clear();
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
        launchArgs: [...profile, '--disable-gpu', '--disable-telemetry'],
        extensionTestsEnv: { EXPEC_NATIVE_REQUEST: requestPath },
      });
    } else throw new Error('Unsupported owned launcher command.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
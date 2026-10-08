const fs = require('node:fs/promises');
const path = require('node:path');

// This distinct extension is only the test runner. The product is installed from its VSIX.
exports.run = async function run() {
  const vscode = require('vscode');
  const request = JSON.parse(await fs.readFile(process.env.EXPEC_NATIVE_REQUEST, 'utf8'));
  const extension = vscode.extensions.getExtension(request.extensionId);
  if (!extension || path.resolve(extension.extensionPath) !== path.resolve(request.extensionPath)) {
    throw new Error('VS Code did not load the VSIX-installed product from its isolated extensions directory.');
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(request.file));
  await fs.writeFile(request.receiptPath, JSON.stringify({
    extensionId: extension.id, extensionPath: extension.extensionPath,
    file: request.file, text: document.getText(), languageId: document.languageId,
  }));
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
    } else {
      await runTests({
        vscodeExecutablePath: request.executable,
        extensionDevelopmentPath: __dirname,
        extensionTestsPath: __filename,
        launchArgs: [...profile, '--disable-gpu', '--disable-telemetry'],
        extensionTestsEnv: { EXPEC_NATIVE_REQUEST: requestPath },
      });
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
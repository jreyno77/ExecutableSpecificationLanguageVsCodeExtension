import { PassThrough } from 'node:stream';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createConnection, createProtocolConnection, ProposedFeatures, StreamMessageReader, StreamMessageWriter, InitializeRequest, PrepareRenameRequest, LSPErrorCodes } from 'vscode-languageserver/node';
import { LanguageServerAdapter } from '../../../src/vscode/LanguageServerAdapter.js';

function protocol() {
  const input = new PassThrough(), output = new PassThrough();
  const connection = createConnection(ProposedFeatures.all, new StreamMessageReader(input), new StreamMessageWriter(output));
  const client = createProtocolConnection(new StreamMessageReader(output), new StreamMessageWriter(input));
  const adapter = new LanguageServerAdapter(connection, { read: () => { throw new Error('Initialization must not acquire source.'); }, localPath: () => undefined }, { keyOf: () => undefined });
  adapter.start(); adapter.start(); connection.listen(); client.listen();
  onTestFinished(() => { adapter.dispose(); client.dispose(); connection.dispose(); input.destroy(); output.destroy(); });
  return client;
}

describe('standard Rename capability negotiation', () => {
  it('offers preparation only to a client supporting versioned document changes', async () => {
    const client = protocol();
    const initialized = await client.sendRequest(InitializeRequest.type, { processId: null, rootUri: null, capabilities: { workspace: { workspaceEdit: { documentChanges: true } } } });
    expect(initialized.capabilities.renameProvider).toEqual({ prepareProvider: true });
  });
  it('explains refusal when a client cannot consume document changes', async () => {
    const client = protocol();
    const initialized = await client.sendRequest(InitializeRequest.type, { processId: null, rootUri: null, capabilities: {} });
    expect(initialized.capabilities.renameProvider).toBeUndefined();
    await expect(client.sendRequest(PrepareRenameRequest.type, { textDocument: { uri: 'file:///workspace/book.expec' }, position: { line: 0, character: 5 } }))
      .rejects.toMatchObject({ code: LSPErrorCodes.RequestFailed, message: expect.stringContaining('documentChanges') });
  });
});

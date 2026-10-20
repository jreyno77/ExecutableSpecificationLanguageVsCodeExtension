import { describe, expect, it } from 'vitest';
import { CancellationError } from 'vscode';
import { CancellationTokenSource } from 'vscode-languageserver/node';
import type { Middleware } from 'vscode-languageclient/node';
import { recordedRename } from '../../driver/vscode/rename-middleware.js';

describe('current native Rename replies', () => {
  it('preserves the real prepare operands and exact native target', async () => {
    const host = recordedRename(), pending = host.pending('prepare'); await pending.requested; pending.complete();
    expect(await pending.result).toBe(host.actualTarget);
    expect(pending.continuationArgs).toEqual([[host.source.native(), pending.position, pending.token]]);
  });
  it('preserves decoded newName and the exact standard edit', async () => {
    const host = recordedRename(), pending = host.pending('rename'); await pending.requested; pending.complete();
    expect(await pending.result).toBe(host.actualEdit);
    expect(pending.continuationArgs).toEqual([[host.source.native(), pending.position, 'Publication 📚', pending.token]]);
  });
  it('cancels preparation after another captured expec buffer changes', async () => {
    const host = recordedRename(), pending = host.pending('prepare'); await pending.requested; host.other.version++; pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels an edit after the requesting buffer closes', async () => {
    const host = recordedRename(), pending = host.pending('rename'); await pending.requested; host.close(); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels an edit after an import buffer is replaced at the same URI and version', async () => {
    const host = recordedRename(), pending = host.pending('rename'); await pending.requested; host.replace(host.other); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels pending preparation when the actual selected configuration notification is sent', async () => {
    const host = recordedRename(), pending = host.pending('prepare'); await pending.requested;
    const sent = await host.configuration(); pending.complete();
    expect(sent.operands).toEqual([['expec/previewConfiguration', sent.params]]);
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels an edit when its request token is cancelled', async () => {
    const cancellation = new CancellationTokenSource(), host = recordedRename(), pending = host.pending('rename', cancellation.token);
    try { await pending.requested; cancellation.cancel(); pending.complete(); await expect(pending.result).rejects.toBeInstanceOf(CancellationError); }
    finally { cancellation.dispose(); }
  });
  it('cancels preparation after disposal', async () => {
    const host = recordedRename(), pending = host.pending('prepare'); await pending.requested; host.adapter.dispose(); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('keeps a reply after other-language edits and unrelated notifications', async () => {
    const host = recordedRename(), pending = host.pending('rename'); await pending.requested; host.notes.version++;
    await host.configuration('textDocument/didSave'); pending.complete(); expect(await pending.result).toBe(host.actualEdit);
  });
  it('preserves prior middleware and restores only the wrappers it owns', async () => {
    const calls: unknown[][] = [];
    const previousPrepare: NonNullable<Middleware['prepareRename']> = (...args) => { calls.push(args); return args[3](args[0], args[1], args[2]); };
    const previousRename: NonNullable<Middleware['provideRenameEdits']> = (...args) => { calls.push(args); return args[4](args[0], args[1], args[2], args[3]); };
    const previousSend: NonNullable<Middleware['sendNotification']> = (type, next, params) => { calls.push([type, next, params]); return next(type, params); };
    const host = recordedRename({ prepareRename: previousPrepare, provideRenameEdits: previousRename, sendNotification: previousSend });
    const prepared = host.pending('prepare'); await prepared.requested; prepared.complete(); expect(await prepared.result).toBe(host.actualTarget);
    const renamed = host.pending('rename'); await renamed.requested; renamed.complete(); expect(await renamed.result).toBe(host.actualEdit);
    const sent = await host.configuration('textDocument/didSave');
    expect(calls).toEqual([[host.source.native(), prepared.position, prepared.token, prepared.next], [host.source.native(), renamed.position, renamed.newName, renamed.token, renamed.next], ['textDocument/didSave', sent.next, sent.params]]);
    const replacement: NonNullable<Middleware['prepareRename']> = () => undefined; host.middleware.prepareRename = replacement;
    host.adapter.dispose(); expect(host.middleware.prepareRename).toBe(replacement); expect(host.middleware.provideRenameEdits).toBe(previousRename); expect(host.middleware.sendNotification).toBe(previousSend);
  });
});

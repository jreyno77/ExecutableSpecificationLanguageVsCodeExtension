import { describe, expect, it, vi } from 'vitest';
import { CancellationTokenSource } from 'vscode-languageserver/node';
import { CancellationError } from '../../resources/vscode/recorded-language-api.js';
import { recordedCompletions } from '../../driver/vscode/completion-middleware.js';

describe('native completion across current expec buffer lifetimes', () => {
  it('cancels a pending completion when the requesting document changes', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.source.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending completion when the requesting document closes', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.close(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending completion when the URI has a replacement buffer', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.replace(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending completion after the native token is cancelled', async () => {
    const host = recordedCompletions(), cancellation = new CancellationTokenSource();
    try { const query = host.pending(cancellation.token); await query.requested;
      cancellation.cancel(); query.complete(); await expect(query.result).rejects.toBeInstanceOf(CancellationError);
    } finally { cancellation.dispose(); }
  });
  it('cancels a pending completion after its adapter is disposed', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.adapter.dispose(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending completion when another captured expec buffer changes', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.other.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending completion when another captured expec buffer closes', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.close(host.other); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending completion when another captured expec buffer is replaced', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.replace(host.other); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('preserves the actual completion when an unrelated plaintext buffer changes', async () => {
    const host = recordedCompletions(), query = host.pending(); await query.requested;
    host.notes.version++; query.complete(); expect(await query.result).toBe(host.actualItems);
  });
  it('preserves prior middleware and starts once before restoring only its wrapper', async () => {
    const previous = vi.fn<NonNullable<ReturnType<typeof recordedCompletions>['middleware']['provideCompletionItem']>>((document, position, context, token, next) => next(document, position, context, token));
    const host = recordedCompletions(previous), installed = host.middleware.provideCompletionItem;
    expect(typeof installed).toBe('function'); expect(installed).not.toBe(previous);
    host.adapter.start(); expect(host.middleware.provideCompletionItem).toBe(installed);
    expect(host.starts()).toBe(1); expect(host.subscriptions).toEqual([host.adapter]);
    const query = host.pending(); await query.requested; query.complete();
    expect(await query.result).toBe(host.actualItems); expect(previous).toHaveBeenCalledTimes(1);
    const operands = [host.source.native(), query.position, query.context, query.token, query.next];
    operands.forEach((operand, index) => expect(previous.mock.calls[0]![index]).toBe(operand));
    expect(query.continuationArgs).toHaveLength(1);
    operands.slice(0, 4).forEach((operand, index) => expect(query.continuationArgs[0]![index]).toBe(operand));
    host.adapter.dispose(); host.adapter.dispose();
    expect(host.middleware.provideCompletionItem).toBe(previous); expect(host.stops()).toBe(0);
  });
  it('keeps another caller’s completion wrapper when disposing', () => {
    const host = recordedCompletions();
    const replacement: NonNullable<typeof host.middleware.provideCompletionItem> = (document, position, context, token, next) => next(document, position, context, token);
    host.middleware.provideCompletionItem = replacement; host.adapter.dispose();
    expect(host.middleware.provideCompletionItem).toBe(replacement);
  });
});
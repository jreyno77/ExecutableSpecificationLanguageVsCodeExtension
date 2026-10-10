import { describe, expect, it, vi } from 'vitest';
import { CancellationTokenSource } from 'vscode-languageserver/node';
import { CancellationError } from '../../resources/vscode/recorded-language-api.js';
import { recordedOutlines } from '../../driver/vscode/outline-middleware.js';

describe('native outlines across requesting document lifetimes', () => {
  it('cancels a pending outline when its requesting document changes', async () => {
    const host = recordedOutlines(), query = host.pending(); await query.requested;
    host.source.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending outline when its requesting document closes', async () => {
    const host = recordedOutlines(), query = host.pending(); await query.requested;
    host.close(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending outline when its URI has a replacement buffer', async () => {
    const host = recordedOutlines(), query = host.pending(); await query.requested;
    host.replace(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending outline when its native token is cancelled', async () => {
    const host = recordedOutlines(), cancellation = new CancellationTokenSource();
    try { const query = host.pending(cancellation.token); await query.requested;
      cancellation.cancel(); query.complete(); await expect(query.result).rejects.toBeInstanceOf(CancellationError);
    } finally { cancellation.dispose(); }
  });
  it('cancels a pending outline when its adapter is disposed', async () => {
    const host = recordedOutlines(), query = host.pending(); await query.requested;
    host.adapter.dispose(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('preserves the actual outline when another expec buffer changes', async () => {
    const host = recordedOutlines(), query = host.pending(); await query.requested;
    host.other.version++; query.complete(); expect(await query.result).toBe(host.actualSymbols);
  });
  it('preserves prior middleware and starts once before restoring only its wrapper', async () => {
    const previous = vi.fn<NonNullable<ReturnType<typeof recordedOutlines>['middleware']['provideDocumentSymbols']>>((document, token, next) => next(document, token));
    const host = recordedOutlines(previous), installed = host.middleware.provideDocumentSymbols;
    expect(typeof installed).toBe('function'); expect(installed).not.toBe(previous);
    host.adapter.start(); expect(host.middleware.provideDocumentSymbols).toBe(installed);
    expect(host.starts()).toBe(1); expect(host.subscriptions).toEqual([host.adapter]);
    const query = host.pending(); await query.requested; query.complete();
    expect(await query.result).toBe(host.actualSymbols); expect(previous).toHaveBeenCalledTimes(1);
    expect(previous.mock.calls[0]![0]).toBe(host.source.native());
    host.adapter.dispose(); host.adapter.dispose();
    expect(host.middleware.provideDocumentSymbols).toBe(previous); expect(host.stops()).toBe(0);
  });
  it('keeps another caller’s symbol wrapper when disposing its adapter', () => {
    const host = recordedOutlines();
    const replacement: NonNullable<typeof host.middleware.provideDocumentSymbols> = (document, token, next) => next(document, token);
    host.middleware.provideDocumentSymbols = replacement; host.adapter.dispose();
    expect(host.middleware.provideDocumentSymbols).toBe(replacement);
  });
});

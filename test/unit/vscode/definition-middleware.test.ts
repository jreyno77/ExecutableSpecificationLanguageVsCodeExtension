import { describe, expect, it, vi } from 'vitest';
import { CancellationTokenSource } from 'vscode-languageserver/node';
import { CancellationError } from '../../resources/vscode/recorded-language-api.js';
import { recordedDefinitions } from '../../driver/vscode/definition-middleware.js';

describe('definition replies across native document lifetimes', () => {
  it('cancels a pending reply when the requesting document changes', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.source.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('cancels a pending reply when the requesting document closes', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.close(host.source); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('cancels a pending reply when the same URI has a replacement requesting document', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.replace(host.source); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('cancels a pending reply when its adapter is disposed', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.adapter.dispose(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('cancels a pending reply when the native token is cancelled', async () => {
    const host = recordedDefinitions(); const cancellation = new CancellationTokenSource();
    try {
      const query = host.pending(cancellation.token); await query.requested;
      cancellation.cancel(); query.complete();
      await expect(query.result).rejects.toBeInstanceOf(CancellationError);
    } finally { cancellation.dispose(); }
  });

  it('cancels a pending reply when its already-open returned target changes', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.target.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('cancels a pending reply when its already-open returned target closes', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.close(host.target); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('cancels a linked reply when its already-open target has a replacement document', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.replace(host.target); query.complete([host.actualLink]);
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });

  it('returns the actual location when only an unrelated open buffer changes', async () => {
    const host = recordedDefinitions(); const query = host.pending();
    await query.requested;
    host.unrelated.version++; query.complete();
    expect(await query.result).toBe(host.actualLocation);
  });

  it('preserves prior middleware, starts once and releases only its installed wrapper', async () => {
    const previous = vi.fn<NonNullable<ReturnType<typeof recordedDefinitions>['middleware']['provideDefinition']>>((document, position, token, next) => next(document, position, token));
    const host = recordedDefinitions(previous);
    const installed = host.middleware.provideDefinition;
    expect(installed).not.toBe(previous);
    expect(typeof installed).toBe('function');
    host.adapter.start();
    expect(host.middleware.provideDefinition).toBe(installed);
    expect(host.starts()).toBe(1);
    expect(host.subscriptions).toEqual([host.adapter]);
    const query = host.pending(); await query.requested; query.complete();
    expect(await query.result).toBe(host.actualLocation);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(previous.mock.calls[0]![0]).toBe(host.source.native());
    host.adapter.dispose(); host.adapter.dispose();
    expect(host.middleware.provideDefinition).toBe(previous);
    expect(host.stops()).toBe(0);
  });

  it('keeps a middleware replacement owned by another caller during disposal', () => {
    const host = recordedDefinitions();
    const replacement: NonNullable<typeof host.middleware.provideDefinition> = (_document, _position, _token, next) => next(host.source.native(), _position, _token);
    host.middleware.provideDefinition = replacement;
    host.adapter.dispose();
    expect(host.middleware.provideDefinition).toBe(replacement);
  });
});

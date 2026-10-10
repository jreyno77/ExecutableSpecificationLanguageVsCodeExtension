import { describe, expect, it, vi } from 'vitest';
import { CancellationTokenSource } from 'vscode-languageserver/node';
import { CancellationError } from '../../resources/vscode/recorded-language-api.js';
import { recordedHovers } from '../../driver/vscode/hover-middleware.js';

describe('hover replies across native document lifetimes', () => {
  it('cancels a pending hover when its requesting document changes', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.source.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending hover when its requesting document closes', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.close(host.source); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending hover when the requesting URI has a replacement buffer', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.replace(host.source); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending hover when another captured expec buffer changes', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.imported.version++; query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending hover when another captured expec buffer closes', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.close(host.imported); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending hover when another captured expec URI has a replacement buffer', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.replace(host.imported); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending hover when its native token is cancelled', async () => {
    const host = recordedHovers(); const cancellation = new CancellationTokenSource();
    try {
      const query = host.pending(cancellation.token); await query.requested;
      cancellation.cancel(); query.complete();
      await expect(query.result).rejects.toBeInstanceOf(CancellationError);
    } finally { cancellation.dispose(); }
  });
  it('cancels a pending hover when its adapter is disposed', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.adapter.dispose(); query.complete();
    await expect(query.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('preserves the actual hover when an ordinary non-expec buffer changes', async () => {
    const host = recordedHovers(); const query = host.pending(); await query.requested;
    host.ordinary.version++; query.complete();
    expect(await query.result).toBe(host.actualHover);
  });
  it('preserves prior hover middleware, starts once and restores only its wrapper', async () => {
    const previous = vi.fn<NonNullable<ReturnType<typeof recordedHovers>['middleware']['provideHover']>>((document, position, token, next) => next(document, position, token));
    const host = recordedHovers(previous), installed = host.middleware.provideHover;
    expect(typeof installed).toBe('function'); expect(installed).not.toBe(previous);
    host.adapter.start(); expect(host.middleware.provideHover).toBe(installed);
    expect(host.starts()).toBe(1); expect(host.subscriptions).toEqual([host.adapter]);
    const query = host.pending(); await query.requested; query.complete();
    expect(await query.result).toBe(host.actualHover);
    expect(previous).toHaveBeenCalledTimes(1); expect(previous.mock.calls[0]![0]).toBe(host.source.native());
    host.adapter.dispose(); host.adapter.dispose();
    expect(host.middleware.provideHover).toBe(previous); expect(host.stops()).toBe(0);
  });
  it('keeps another caller’s hover wrapper when disposing its own adapter', () => {
    const host = recordedHovers();
    const replacement: NonNullable<typeof host.middleware.provideHover> = (document, position, token, next) => next(document, position, token);
    host.middleware.provideHover = replacement; host.adapter.dispose();
    expect(host.middleware.provideHover).toBe(replacement);
  });
});

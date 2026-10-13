import { describe, expect, it } from 'vitest';
import { CancellationError } from 'vscode';
import { CancellationTokenSource } from 'vscode-languageserver/node';
import { recordedReferences } from '../../driver/vscode/reference-middleware.js';

describe('current native References replies', () => {
  it('preserves the actual context operands and unchanged continuation reply', async () => {
    const native = recordedReferences(), pending = native.pending(true);
    await pending.requested;
    expect(pending.continuationArgs).toEqual([[native.source.native(), pending.position, pending.context, pending.token]]);
    pending.complete();
    expect(await pending.result).toBe(native.actualLocations);
  });
  it('preserves the prior native middleware and restores only its own wrapper', async () => {
    const args: unknown[][] = [];
    const previous = (...values: Parameters<NonNullable<import('vscode-languageclient/node').Middleware['provideReferences']>>) => {
      args.push(values); return values[4](values[0], values[1], values[2], values[3]);
    };
    const native = recordedReferences(previous), pending = native.pending(false);
    await pending.requested; pending.complete();
    expect(await pending.result).toBe(native.actualLocations);
    expect(args).toEqual([[native.source.native(), pending.position, pending.context, pending.token, pending.next]]);
    native.adapter.dispose();
    expect(native.middleware.provideReferences).toBe(previous);
  });
  it('cancels a pending reply after the requesting buffer changes', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.source.version++; pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending reply after another captured expec buffer changes', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.other.version++; pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending reply after the requesting buffer closes', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.close(); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending reply after a captured import buffer closes', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.close(native.other); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending reply after a captured buffer is replaced at the same URI and version', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.replace(native.other); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending reply after disposal', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.adapter.dispose(); pending.complete();
    await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
  });
  it('cancels a pending reply after its actual request token is cancelled', async () => {
    const cancellation = new CancellationTokenSource(), native = recordedReferences(), pending = native.pending(false, cancellation.token);
    try {
      await pending.requested; cancellation.cancel(); pending.complete();
      await expect(pending.result).rejects.toBeInstanceOf(CancellationError);
    } finally { cancellation.dispose(); }
  });
  it('keeps a pending reply usable after another-language buffer changes', async () => {
    const native = recordedReferences(), pending = native.pending();
    await pending.requested; native.notes.version++; pending.complete();
    expect(await pending.result).toBe(native.actualLocations);
  });
});


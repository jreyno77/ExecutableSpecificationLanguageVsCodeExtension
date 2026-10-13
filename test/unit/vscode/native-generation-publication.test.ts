import { describe, expect, it } from 'vitest';
import { generationPublication } from '../../driver/vscode/native-generation.js';

describe('actual native generation publication matching', () => {
  it('does not settle stale rendered idle using a new failure for the saved source', () => {
    const before = '[idle] Generation will run after a configured source is saved.\n';
    const log = before + '[generating] Building the complete saved configuration.\n'
      + '[failed] spawn /owned/absent-node.exe ENOENT\n';
    expect(generationPublication('idle', log, before.length)).toBeUndefined();
    expect(generationPublication('idle', log)).toBeUndefined();
  });

  it('observes the matching actual fresh launch failure', () => {
    const before = '[idle] Generation will run after a configured source is saved.\n';
    const log = before + '[generating] Building the complete saved configuration.\n'
      + '[failed] spawn /owned/absent-node.exe ENOENT\n';
    expect(generationPublication('failed', log, before.length)).toEqual({
      status: 'failed', explanation: 'spawn /owned/absent-node.exe ENOENT', log,
    });
  });

  it('does not treat preparatory idle after configuration reset as a completed save', () => {
    const before = '[blocked] Choose a saved project configuration before generating.\n';
    const log = before + '[idle] Generation will run after a configured source is saved.\n';
    expect(generationPublication('idle', log, before.length)).toBeUndefined();
  });

  it('retains genuine fresh idle for an unrelated saved source', () => {
    const before = '[idle] Generation will run after a configured source is saved.\n';
    const log = before + '[idle] This saved document is outside the configured build entries and imports.\n';
    expect(generationPublication('idle', log, before.length)).toEqual({
      status: 'idle', explanation: 'This saved document is outside the configured build entries and imports.', log,
    });
  });

  it('observes ordinary idle when no saved-source settlement is requested', () => {
    const log = '[idle] Generation will run after a configured source is saved.\n';
    expect(generationPublication('idle', log)).toEqual({
      status: 'idle', explanation: 'Generation will run after a configured source is saved.', log,
    });
  });
});

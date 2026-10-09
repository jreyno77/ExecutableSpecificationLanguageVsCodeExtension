import { describe, expect, it } from 'vitest';
import { generationCleanupState } from '../../driver/vscode/native-generation.js';

// These are recording-classifier controls, not proof that a process or target tree was cleaned up.
describe('native generation cleanup recording', () => {
  it('reports unconfirmed native descendant state instead of accepting a terminal error line', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Native descendant state is unconfirmed; earlier generation effects may be partial or uncertain.\n')).toBe('unconfirmed');
  });

  it('reports forced owned Node child cleanup as unconfirmed', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Forced owned Node child cleanup after failed IPC; native descendant state remains unconfirmed.\n')).toBe('unconfirmed');
  });

  it('reports missing child CLOSE after forced cleanup as unconfirmed', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Owned child CLOSE was not observed after forced cleanup; process state and effects are uncertain.\n')).toBe('unconfirmed');
  });

  it('reports a missing SDK terminal result with unconfirmed CLOSE', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Owned generation child has no SDK terminal result; CLOSE remains unconfirmed.\n')).toBe('unconfirmed');
  });

  it('reports lost parent IPC with uncertain effects as unconfirmed', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Generation parent IPC was lost; effects may be partial or uncertain.\n')).toBe('unconfirmed');
  });

  it('preserves the existing forced owned child cleanup warning', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Forced owned child cleanup.\n')).toBe('unconfirmed');
  });

  it('preserves the existing failed cleanup warning', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Owned IPC cleanup failed: disconnected.\n')).toBe('unconfirmed');
  });

  it('preserves the existing refused force cleanup warning', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Owned child force cleanup was not accepted.\n')).toBe('unconfirmed');
  });

  it('accepts an ordinary Exit receipt after the generating record', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nExit 0\n[built] Generated saved output.\n')).toBe('settled');
  });

  it('accepts an ordinary cooperative cancellation receipt', () => {
    expect(generationCleanupState('[generating] Building saved specification.\nGeneration error: Generation was cancelled before applying output.\n[cancelled] The saved build was cancelled.\n')).toBe('settled');
  });

  it('keeps a later admitted generation pending after an earlier Exit receipt', () => {
    expect(generationCleanupState('[generating] First saved specification.\nExit 0\n[generating] Latest saved specification.\n')).toBe('pending');
  });

  it('does not treat a disabled publication alone as a child terminal receipt', () => {
    expect(generationCleanupState('[generating] Building saved specification.\n[disabled] Generation on save is disabled.\n')).toBe('pending');
  });

  it('accepts a recording where no generation was admitted', () => {
    expect(generationCleanupState('[disabled] Generation on save is disabled.\n')).toBe('settled');
  });
});

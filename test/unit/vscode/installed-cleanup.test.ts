import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { InstalledExpecEditor } from '../../driver/vscode/installed-extension.js';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';

// This exercises actual installation disposal over real owned bytes and
// controlled disposal ports; it does not launch or certify a native process.
it('retains installation bytes and every cleanup cause when case and session disposal both reject', async () => {
  const directory = await ownTemporaryDirectory('expec-installed-cleanup-control-');
  const workspace = await ownTemporaryDirectory('workspace-', directory);
  const sentinel = join(workspace, 'saved-target.txt');
  const content = 'Handwritten target and cleanup evidence must remain.\n';
  try {
    await writeFile(sentinel, content);
    const installed = Reflect.construct(InstalledExpecEditor,
      [directory, workspace, 'unused-native-executable', 'installed.expec', join(directory, 'extensions'), {}]) as InstalledExpecEditor;
    // Only private ownership state is arranged; public dispose and the real
    // removeOwnedDirectory boundary execute unchanged.
    const ownership = installed as unknown as {
      generationEditors: Set<{ dispose(): Promise<void> }>;
      activeSession: { dispose(): Promise<void> };
    };
    const attempts: string[] = [];
    const direct = new NativeCleanupError('Owned generation descendant stop was not confirmed.');
    const nested = new NativeCleanupError('Another owned generation target cleanup was not confirmed.');
    const wrapped = new AggregateError([nested], 'Owned case cleanup rejected.', { cause: nested });
    const session = new Error('Original poisoned native session refusal.');
    ownership.generationEditors.add({ dispose: async () => { attempts.push('direct case'); throw direct; } });
    ownership.generationEditors.add({ dispose: async () => { attempts.push('wrapped case'); throw wrapped; } });
    ownership.activeSession = { dispose: async () => { attempts.push('session'); throw session; } };
    let actual: unknown;
    try { await installed.dispose(); } catch (error) { actual = error; }
    expect(attempts).toEqual(['direct case', 'wrapped case', 'session']);
    expect(actual).toBeDefined();
    const retained = await readFile(sentinel, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    expect(retained, 'Actual installation disposal must retain its owned target after cleanup uncertainty.').toBe(content);
    const causes = cleanupMessages(actual);
    expect(causes).toContain(direct.message);
    expect(causes).toContain(nested.message);
    expect(causes).toContain(session.message);
  } finally {
    // These controlled ports own no child. The unit removes retained evidence
    // only after observing the real production boundary's retention decision.
    const exists = await stat(directory).then(() => true, error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    if (exists) await removeOwnedDirectory(directory);
  }
});

function cleanupMessages(error: unknown): string[] {
  const seen = new Set<object>(), messages: string[] = [];
  const visit = (value: unknown): void => {
    if (!(value instanceof Error) || seen.has(value)) return;
    seen.add(value); messages.push(value.message);
    if (value instanceof AggregateError) for (const cause of value.errors) visit(cause);
    visit(value.cause);
  };
  visit(error); return messages;
}
it('preserves a rejected active-open cause when disposal retains the installation', async () => {
  const directory = await ownTemporaryDirectory('expec-installed-active-cleanup-');
  const workspace = await ownTemporaryDirectory('workspace-', directory);
  const sentinel = join(workspace, 'open-evidence.txt');
  const content = 'Evidence from the pending native open.\n';
  try {
    await writeFile(sentinel, content);
    const installed = Reflect.construct(InstalledExpecEditor,
      [directory, workspace, 'unused-native-executable', 'installed.expec', join(directory, 'extensions'), {}]) as InstalledExpecEditor;
    const ownership = installed as unknown as {
      activeOpens: Set<Promise<string>>;
      cleanupUnconfirmed: boolean;
    };
    let rejectOpen!: (error: Error) => void;
    const pending = new Promise<string>((_resolve, reject) => { rejectOpen = reject; });
    const refused = new NativeCleanupError('The active native open could not confirm its owned cleanup.');
    // Match openDocument's established uncertainty while the owned operation is
    // pending; public installation disposal must still collect that rejection.
    void pending.catch(() => { ownership.cleanupUnconfirmed = true; });
    ownership.activeOpens.add(pending);
    const disposal = installed.dispose();
    rejectOpen(refused);
    let actual: unknown;
    try { await disposal; } catch (error) { actual = error; }
    expect(actual).toBeInstanceOf(NativeCleanupError);
    expect(await readFile(sentinel, 'utf8')).toBe(content);
    expect(cleanupMessages(actual)).toContain(refused.message);
  } finally {
    const exists = await stat(directory).then(() => true, error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    if (exists) await removeOwnedDirectory(directory);
  }
});
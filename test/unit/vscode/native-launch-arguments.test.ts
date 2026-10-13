import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const worker = fileURLToPath(new URL('../../resources/vscode/native-host/run.cjs', import.meta.url));

/** Execute the real CLI branch with a recorded process port; no editor or SDK download is launched. */
async function ownedSession() {
  const child = new EventEmitter(), failures: unknown[] = [];
  let launched!: () => void;
  const ready = new Promise<void>(resolve => { launched = resolve; });
  let actual: { executable: string; args: string[]; options: { env: Record<string, string>; windowsHide: boolean; stdio: string } } | undefined;
  const request = { command: 'session', executable: '/owned/code', extensionsDirectory: '/owned/extensions',
    userDataDirectory: '/owned/profile', workspaceDirectory: '/owned/workspace' };
  const commandProcess: { argv: string[]; env: Record<string, string>; platform: string; exitCode?: number } = {
    argv: ['node', worker, '/owned/native-request.json'], env: { DISPLAY: ':99', PATH: '/owned/node/bin' }, platform: 'linux',
  };
  const module = { exports: {} };
  const requirePort = Object.assign((id: string) => {
    if (id === 'node:fs/promises') return { readFile: async () => JSON.stringify(request) };
    if (id === 'node:net' || id === '@vscode/test-electron') return {};
    if (id === 'node:child_process') return { spawn: (executable: string, args: string[], options: NonNullable<typeof actual>['options']) => {
      actual = { executable, args: [...args], options }; launched(); return child;
    } };
    throw new Error('An unexpected launch dependency was requested: ' + id);
  }, { main: module });
  runInNewContext(await readFile(worker, 'utf8'), { require: requirePort, module, exports: module.exports,
    process: commandProcess, __dirname: dirname(worker), console: { error: (error: unknown) => failures.push(error) } }, { filename: worker });
  await ready;
  if (!actual) throw new Error('The actual worker did not launch its owned session.');
  return { actual, process: commandProcess, failures,
    close: async (code: number) => { child.emit('close', code); await new Promise<void>(resolve => setImmediate(resolve)); } };
}

it('starts its ordinary owned Linux window with the official SDK sandbox argument', async () => {
  const session = await ownedSession();
  try {
    expect(session.actual.args).toContain('--no-sandbox');
    expect(session.actual.args).toEqual(expect.arrayContaining(['--user-data-dir', '/owned/profile', '--extensions-dir', '/owned/extensions',
      '/owned/workspace', '--new-window', '--extensionDevelopmentPath=' + dirname(worker), '--remote-debugging-address=127.0.0.1']));
    expect(session.actual.args.some(argument => argument.startsWith('--extensionTestsPath'))).toBe(false);
    expect(session.actual.options).toMatchObject({ windowsHide: true, stdio: 'inherit',
      env: { DISPLAY: ':99', EXPEC_NATIVE_REQUEST: '/owned/native-request.json' } });
  } finally { await session.close(0); }
  expect(session.failures).toEqual([]);
  expect(session.process.exitCode).toBeUndefined();
});

it('keeps a failed owned window exit as a failed launcher command', async () => {
  const session = await ownedSession();
  expect(session.failures).toEqual([]);
  expect(session.process.exitCode).toBeUndefined();
  await session.close(1);
  expect(session.failures.map(String)).toEqual(['Error: The owned native window exited 1.']);
  expect(session.process.exitCode).toBe(1);
});
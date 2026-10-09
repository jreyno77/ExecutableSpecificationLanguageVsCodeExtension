import { describe, expect, it } from 'vitest';
import { NativeLauncherOutput, nativeLauncherEnvironment } from '../../driver/vscode/native-process.js';

// Launcher ownership only: these controls do not claim an installed endpoint or CI fix.
describe('owned native launcher profile', () => {
  it('does not let an inherited app-data override replace its requested profile', () => {
    const inherited = { VSCODE_APPDATA: 'C:/another-vscode-profile', PATH: 'C:/owned-node/bin' };
    const actual = nativeLauncherEnvironment(inherited);
    expect(actual.VSCODE_APPDATA).toBeUndefined();
    expect(actual.PATH).toBe('C:/owned-node/bin');
    expect(inherited.VSCODE_APPDATA).toBe('C:/another-vscode-profile');
  });
  it('does not let inherited portable mode replace its requested profile', () => {
    const inherited = { VSCODE_PORTABLE: 'C:/another-portable-installation' };
    const actual = nativeLauncherEnvironment(inherited);
    expect(actual.VSCODE_PORTABLE).toBeUndefined();
    expect(inherited.VSCODE_PORTABLE).toBe('C:/another-portable-installation');
  });
  it('keeps ordinary toolchain values while clearing inherited instance launch flags', () => {
    const actual = nativeLauncherEnvironment({ ELECTRON_RUN_AS_NODE: '1', VSCODE_IPC_HOOK_CLI: 'another-instance', PATH: 'C:/owned-node/bin' });
    expect(actual).toEqual({ PATH: 'C:/owned-node/bin' });
  });
});

it('clears mixed-case Windows launch/profile keys without mutating their input', () => {
  const inherited = { VsCode_AppData: 'C:/another-profile', vscode_portable: 'C:/another-portable',
    Electron_Run_As_Node: '1', Vscode_Ipc_Hook_Cli: 'another-instance', Path: 'C:/owned-node/bin' };
  expect(nativeLauncherEnvironment(inherited)).toEqual({ Path: 'C:/owned-node/bin' });
  expect(inherited.VsCode_AppData).toBe('C:/another-profile');
  expect(inherited.vscode_portable).toBe('C:/another-portable');
  expect(inherited.Electron_Run_As_Node).toBe('1');
  expect(inherited.Vscode_Ipc_Hook_Cli).toBe('another-instance');
});

// Redaction/retention controls only: no claim about an installed host or network endpoint.
const token = '0123456789abcdef'.repeat(4);
describe('owned launcher diagnostic text', () => {
  it('withholds a token prefix until its later chunk can be safely redacted', () => {
    const output = new NativeLauncherOutput(token);
    output.append('before ' + token.slice(0, 32));
    expect(output.read()).not.toContain(token.slice(0, 32));
    output.append(token.slice(32) + ' after');
    expect(output.read()).toContain('before [redacted session token] after');
    expect(output.read()).not.toContain(token);
  });
  it('redacts a token before retaining a tail that would cut through it', () => {
    const output = new NativeLauncherOutput(token);
    output.append(token.slice(0, 32));
    output.append(token.slice(32) + 'x'.repeat(16 * 1024 - 32));
    expect(output.read()).not.toContain(token.slice(32));
    expect(output.read()).toContain('[redacted session token]');
  });
  it('keeps redaction boundaries separate when stderr interleaves stdout chunks', () => {
    const output = new NativeLauncherOutput(token);
    output.append(token.slice(0, 32), 'stdout');
    output.append('native notice\n', 'stderr');
    output.append(token.slice(32), 'stdout');
    expect(output.read()).not.toContain(token.slice(0, 32));
    expect(output.read()).toContain('native notice\n');
    expect(output.read()).toContain('[redacted session token]');
  });
  it('preserves ordinary output and explicitly reports bounded retention', () => {
    const output = new NativeLauncherOutput(token);
    output.append('x'.repeat(20 * 1024) + 'ordinary native output\n');
    expect(output.read()).toContain('output truncated:');
    expect(output.read()).toContain('ordinary native output\n');
    expect(output.read().length).toBeLessThan(16 * 1024 + 150);
  });
});

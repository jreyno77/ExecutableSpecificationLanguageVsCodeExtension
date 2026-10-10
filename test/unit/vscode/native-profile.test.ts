import { expect, it } from 'vitest';
import { NativeProfileLaunch } from '../../driver/vscode/native-profile.js';

it('prepares the requested owned profile before starting its native launcher', async () => {
  const launch = await NativeProfileLaunch.prepare();
  try {
    await launch.start();
    expect(launch.profileDirectoryAtSpawn()).toBe(true);
    expect(launch.requestedProfileAtSpawn()).toBe(launch.profile);
    expect(launch.childCount()).toBe(1);
    await launch.closed();
  } finally { await launch.dispose(); }
});

it('preserves existing profile bytes when preparing the launcher', async () => {
  const launch = await NativeProfileLaunch.prepare();
  try {
    await launch.profileFile('settings.json', '{"keep":"handwritten profile"}\n');
    await launch.profileFile('nested/state.txt', 'existing state\n');
    const before = await launch.profileTree();
    await launch.start();
    expect(launch.profileDirectoryAtSpawn()).toBe(true);
    expect(launch.profileTreeAtSpawn()).toEqual(before);
    await launch.closed();
    expect(await launch.profileTree()).toEqual(before);
  } finally { await launch.dispose(); }
});

it('refuses a filesystem preparation failure before starting a child', async () => {
  const launch = await NativeProfileLaunch.prepare();
  try {
    await launch.profilePathIsFile('owned blocker bytes\n');
    const failure = await launch.startFailure();
    expect(failure).toBeInstanceOf(Error);
    expect(launch.childCount()).toBe(0);
    expect(await launch.profilePathBytes()).toBe('owned blocker bytes\n');
  } finally { await launch.dispose(); }
});

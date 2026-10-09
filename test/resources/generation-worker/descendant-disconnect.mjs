import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
let descendant; let ownedRoot;
process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.once('message', message => {
  if (message.type !== 'start') throw Error('Expected start.');
  ownedRoot = dirname(message.manifest);
  descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  writeFileSync(join(dirname(message.manifest), 'descendant.json'), JSON.stringify({ worker: process.pid, descendant: descendant.pid }));
  process.send({ type: 'check', id: 1, root: dirname(message.manifest) }, () => process.disconnect());
});
process.on('disconnect', () => {
  // An actual child-owned cleanup opportunity, not a simulated SDK outcome.
  setTimeout(() => {
    descendant.once('close', () => writeFileSync(join(ownedRoot, 'cleanup.txt'), 'descendant closed'));
    descendant.kill('SIGKILL');
  }, 150);
});
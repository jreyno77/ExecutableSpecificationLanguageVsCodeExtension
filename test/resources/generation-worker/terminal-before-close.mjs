import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.once('message', message => {
  if (message.type !== 'start') throw Error('Expected start.');
  const root = dirname(message.manifest);
  process.send({ type: 'result', exitCode: 0, report: JSON.stringify({ pid: process.pid, completed: true }) }, () => {
    process.disconnect();
    writeFileSync(join(root, 'terminal-disconnected.txt'), 'terminal sent and IPC disconnected');
    const waiting = setInterval(() => {
      if (existsSync(join(root, 'release-close.txt'))) clearInterval(waiting);
    }, 10);
  });
});
import { dirname } from 'node:path';
let cancels = 0;
process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.on('message', message => {
  if (message.type === 'start') process.send({ type: 'check', id: 1, root: dirname(message.manifest) });
  if (message.type === 'cancel') {
    cancels++;
    process.send({ type: 'result', exitCode: 0, report: JSON.stringify({ pid: process.pid, cancels }) }, () => process.disconnect());
  }
});
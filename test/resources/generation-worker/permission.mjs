import { dirname } from 'node:path';
process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.on('message', message => {
  if (message.type === 'start') process.send({ type: 'check', id: 1, root: dirname(message.manifest) });
  if (message.type === 'permission') {
    process.stderr.write('Actual successful child warning\n');
    process.send({ type: 'result', exitCode: 0, report: JSON.stringify({ problems: message.problems, error: message.error, pid: process.pid }) }, () => process.disconnect());
  }
});
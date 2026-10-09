import { dirname } from 'node:path';
// A disconnected child must not keep owned cleanup waiting forever.
process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.once('message', message => {
  if (message.type !== 'start') throw Error('Expected start.');
  process.send({ type: 'check', id: 1, root: dirname(message.manifest) }, () => process.disconnect());
  setInterval(() => {}, 1000);
});
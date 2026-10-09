process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.once('message', message => {
  if (message.type !== 'start') throw Error('Expected start.');
  process.stderr.write('X'.repeat(131072), () => process.send({ type: 'result', exitCode: 0, report: '{"completed":true}' }, () => process.disconnect()));
});
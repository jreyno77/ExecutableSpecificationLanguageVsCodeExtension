// A real Node child for process/stream ownership tests; it does not simulate SDK builds.
process.send({ type: 'ready', runtimeVersion: process.versions.node });
process.once('message', message => {
  if (message.type !== 'start') throw Error('Expected an actual start request.');
  process.stdout.write('unrelated native application log\n');
  process.send({ type: 'result', exitCode: 0,
    report: JSON.stringify({ transport: 'finished', pid: process.pid, manifest: message.manifest }) + '\n' }, () => {
    process.disconnect();
  });
});

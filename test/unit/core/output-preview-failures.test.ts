import { describe, expect, it } from 'vitest';
import { markdownOutput, umlOutput, type OutputRegistration } from 'executable-specification-language';
import { OutputPreviewsRecording } from '../../driver/output-previews.js';

const failedOutput: OutputRegistration = {
  id: 'broken', validate: () => [],
  open: () => { throw Error('A preview must never open an adapter.'); },
  preview: async () => { throw Error('Renderer failed after receiving the actual checked specification.'); },
};

describe('preview provider failures and owned recording cleanup', () => {
  it('presents a throwing provider as refused while real Markdown completes', async () => {
    const recording = await OutputPreviewsRecording.withRegistrations(
      '{"formatVersion":1,"version":"0.1.0","build":{"entries":["src/library.expec"]},"outputs":[{"id":"broken","options":{}},{"id":"markdown","options":{"directory":"draft/docs"}}]}',
      [failedOutput, markdownOutput],
    );
    recording.opened({ uri: 'file:///workspace/src/library.expec', text: 'type Book { title: Text }' }, 1);
    await recording.settle();
    expect(recording.tab('broken').status).toBe('refused');
    expect(recording.tab('broken').documents).toEqual([]);
    expect(recording.tab('broken').message).toContain('Renderer failed after receiving the actual checked specification.');
    expect(recording.tab('markdown').status).toBe('ready');
    expect(recording.document('markdown', 'draft/docs/Book.md').content).toContain('type Book');
    expect(await recording.preserved()).toBe(true);
  });

  it('releases its actual SVG context and owned tree when a running provider rejects during cleanup', async () => {
    const recording = await OutputPreviewsRecording.withRegistrations(
      '{"formatVersion":1,"version":"0.1.0","build":{"entries":["src/library.expec"]},"outputs":[{"id":"uml","options":{"directory":"draft/uml","views":["structure"]}},{"id":"broken","options":{}}]}',
      [umlOutput, failedOutput], 'broken',
    );
    recording.opened({ uri: 'file:///workspace/src/library.expec', text: 'type Book { title: Text }' }, 1);
    await recording.awaitHeld('broken');
    await recording.ready('uml');
    expect(await recording.svgHasLabel('uml', 'draft/uml/structure.svg', 'Book')).toBe(true);
    expect(await recording.releasedResources()).toEqual({ context: false, fixture: false });

    let cleanupError: unknown;
    try { await recording.dispose(); } catch (error) { cleanupError = error; }

    expect(await recording.releasedResources()).toEqual({ context: true, fixture: true });
    expect(cleanupError).toBeUndefined();
  });
});

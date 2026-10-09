import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { GenerationLifetime } from '../../driver/generation-lifetime.js';

describe('saved generation lifetime', () => {
  it('keeps only the latest save and waits for the cancelled request to finish', async () => {
    const generation = await GenerationLifetime.create();
    await generation.save('type Book { title: Number }', 2);
    await generation.waitFor(() => generation.starts.length === 1);
    await generation.save('type Book { title: Boolean }', 3);
    await generation.waitFor(() => generation.states.at(-1)?.status === 'queued');
    await generation.save('type Book { title: Text }', 4);
    await generation.waitFor(() => generation.states.at(-1)?.sourceVersion === 4 && generation.states.at(-1)?.status === 'queued', 'latest save queue publication');
    generation.core.editorChanged();
    expect(generation.starts).toHaveLength(1);
    expect(generation.cancellations).toBe(1);
    generation.finish(0);
    await generation.waitFor(() => generation.starts.length === 2);
    expect(generation.starts[1].request.version).toBe(4);
    expect(generation.starts[1].request.source.text).toBe('type Book { title: Text }');
    expect(generation.states.at(-1)?.status).toBe('generating');
  });

  it('a later save retries a settled refusal at the same editor version', async () => {
    const generation = await GenerationLifetime.create();
    await generation.save('type Book { title: Number }', 2);
    await generation.waitFor(() => generation.starts.length === 1);
    generation.finish(0);
    expect(generation.states.at(-1)?.status).toBe('failed');
    await generation.save('type Book { title: Number }', 2);
    await generation.waitFor(() => generation.starts.length === 2);
    expect(generation.starts[1].request.version).toBe(2);
    expect(generation.starts[1].request.source.text).toBe('type Book { title: Number }');
  });

  it('disposal cancels once and records settlement without publishing or starting later work', async () => {
    const generation = await GenerationLifetime.create();
    await generation.save('type Book { title: Number }', 2);
    await generation.waitFor(() => generation.starts.length === 1);
    generation.core.dispose(); generation.core.dispose();
    const publications = generation.states.length;
    await generation.save('type Book { title: Text }', 3);
    generation.finish(0);
    expect(generation.cancellations).toBe(1);
    expect(generation.starts).toHaveLength(1);
    expect(generation.states).toHaveLength(publications);
    expect(generation.records).toHaveLength(1);
    expect(generation.records[0].result.error).toBe('Owned scheduling port refused the request.');
  });

  it('an obsolete actual SDK receipt remains recorded without replacing the withdrawn selection', async () => {
    const generation = await GenerationLifetime.withActualReceipt();
    const receipt = generation.actualReceipt();
    expect(JSON.parse(receipt.report).status).toBe('built');
    await generation.save('type Book { title: Number }', 2);
    await generation.waitFor(() => generation.starts.length === 1);
    generation.core.configurationChanged(undefined, false);
    const current = generation.states.at(-1);
    generation.finish(0, receipt);
    expect(generation.records).toEqual([{ file: generation.manifest, result: receipt }]);
    expect(generation.states.at(-1)).toEqual(current);
    expect(generation.cancellations).toBe(1);
  }, 30_000);

  it('invalid editor versions throw before changing state or invoking the worker', async () => {
    const generation = await GenerationLifetime.create();
    const publications = generation.states.length;
    const source = { uri: pathToFileURL(generation.file).href, text: 'type Book { title: Text }' };
    for (const version of [0, -1, 0.5, NaN, Infinity]) expect(() => generation.core.sourceSaved(source, version)).toThrow(RangeError);
    expect(generation.states).toHaveLength(publications);
    expect(generation.starts).toHaveLength(0);
    expect(generation.records).toHaveLength(0);
    expect(generation.cancellations).toBe(0);
  });
});

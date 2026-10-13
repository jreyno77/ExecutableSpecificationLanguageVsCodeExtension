import { describe, expect, it } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';

const unsaved = {
  uri: 'file:///workspace/src/ui/view.expec',
  text: 'component ReactView { requires package "react" for runtime }',
};
function configuration(folder: string) {
  return { file: 'C:/workspace/expec.json', writable: true, text: JSON.stringify({
    formatVersion: 1, version: '0.1.0', build: { entries: ['src/ui/view.expec'] }, outputs: [],
    packages: [{ alias: 'react', name: 'npm:react', version: '19.3.0', phases: ['runtime'] }],
    requirements: { folders: [{ path: folder, runtime: ['react'] }] },
  }) };
}

describe('saved scope facts at the live-analysis boundary', () => {
  it('rechecks retained unsaved text when only the saved folder requirements change', () => {
    const publications: Array<{ source: typeof unsaved; version: number; report: DocumentReport }> = [];
    const analysis = new DocumentAnalysis({
      publish: (source, version, report) => { publications.push({ source, version, report }); },
      clear: () => {},
    }, { read: () => undefined, localPath: () => 'src/ui/view.expec' });

    analysis.configurationChanged(configuration('src/ui'));
    analysis.opened(unsaved, 7);
    expect(publications[0]?.report.compilation?.value).toBeDefined();

    analysis.configurationChanged(configuration('src/core'));

    expect(publications).toHaveLength(2);
    expect(publications.map(publication => publication.version)).toEqual([7, 7]);
    expect(publications[1]?.source).toEqual(unsaved);
    expect(publications[0]?.report.requirements?.map(row => row.alias)).toEqual(['react']);
    expect(publications[1]?.report.requirements).toEqual([]);
    expect(publications[1]?.report.compilation?.value).toBeDefined();
  });
});

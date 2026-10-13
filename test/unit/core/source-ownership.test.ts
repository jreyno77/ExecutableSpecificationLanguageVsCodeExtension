import { describe, expect, it } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';

const source = { uri: 'file:///workspace/src/ui/view.expec', text: 'type View {}' };
const configuration = { file: 'C:/workspace/expec.json', writable: true, text: JSON.stringify({
  formatVersion: 1, version: '0.1.0', build: { entries: ['src/ui/view.expec'] }, outputs: [],
  packages: [{ alias: 'react', name: 'npm:react', version: '19.3.0', phases: ['runtime'] }],
  requirements: { folders: [{ path: 'src/ui', runtime: ['react'] }] },
}) };
function ownedAnalysis(path: () => string | undefined) {
  const reports: Array<{ text: string; version: number; report: DocumentReport }> = [];
  let queries = 0, savedReads = 0;
  const analysis = new DocumentAnalysis({ publish: (snapshot, version, report) => {
    reports.push({ text: snapshot.text, version, report });
  }, clear: () => {} }, { localPath: () => { queries++; return path(); }, read: () => { savedReads++; return undefined; } });
  return { analysis, reports, queries: () => queries, savedReads: () => savedReads };
}

describe('source ownership supplied to current live scope facts', () => {
  it('reuses ownership for text edits and rechecks a changed route without reading over unsaved text', () => {
    let path = 'src/ui/view.expec';
    const recording = ownedAnalysis(() => path);
    recording.analysis.configurationChanged(configuration);
    recording.analysis.opened(source, 1);
    recording.analysis.changed({ ...source, text: 'type Revised {}' }, 2);
    expect(recording.queries()).toBe(1);
    expect(recording.reports.at(-1)?.report.requirements?.map(row => row.alias)).toEqual(['react']);
    recording.analysis.sourceChanged('file:///workspace/unrelated.expec');
    expect(recording.queries()).toBe(1);
    path = 'src/core/view.expec';
    recording.analysis.sourceChanged(source.uri);
    expect(recording.queries()).toBe(2);
    expect(recording.savedReads()).toBe(0);
    expect(recording.reports.at(-1)?.text).toBe('type Revised {}');
    expect(recording.reports.at(-1)?.version).toBe(2);
    expect(recording.reports.at(-1)?.report.requirements).toEqual([]);
    expect(recording.reports[0]?.report.requirements?.map(row => row.alias)).toEqual(['react']);
  });

  it('caches unavailable ownership until that route is invalidated', () => {
    let path: string | undefined;
    const recording = ownedAnalysis(() => path);
    recording.analysis.configurationChanged(configuration);
    recording.analysis.opened(source, 1);
    recording.analysis.changed({ ...source, text: 'type Revised {}' }, 2);
    expect(recording.queries()).toBe(1);
    expect(recording.reports.at(-1)?.report.requirements).toEqual([]);
    path = 'src/ui/view.expec';
    recording.analysis.sourceChanged(source.uri);
    expect(recording.queries()).toBe(2);
    expect(recording.reports.at(-1)?.report.requirements?.map(row => row.alias)).toEqual(['react']);
  });

  it('publishes only the new configuration when a provider reenters scope selection', () => {
    let reenter = true;
    const recording = ownedAnalysis(() => {
      if (reenter) {
        reenter = false;
        recording.analysis.configurationChanged({ ...configuration, file: 'C:/another/expec.json' });
        return 'src/core/view.expec';
      }
      return 'src/ui/view.expec';
    });
    recording.analysis.configurationChanged(configuration);
    recording.analysis.opened(source, 7);
    expect(recording.reports).toHaveLength(1);
    expect(recording.reports[0]?.version).toBe(7);
    expect(recording.reports[0]?.report.requirements?.[0]?.at).toEqual({ kind: 'dependency',
      path: ['manifest', 'C:/another/expec.json', 'requirements', 'folders', 0, 'runtime', 0] });
    recording.analysis.changed({ ...source, text: 'type Revised {}' }, 8);
    expect(recording.queries()).toBe(2);
    expect(recording.reports.at(-1)?.report.requirements?.map(row => row.alias)).toEqual(['react']);
  });
});
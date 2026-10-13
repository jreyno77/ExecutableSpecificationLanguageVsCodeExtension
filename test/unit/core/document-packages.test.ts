import { describe, expect, it, vi } from 'vitest';
import { ConfigurationReader, LangiumReader } from 'executable-specification-language';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';

const view = { uri: 'file:///workspace/view.expec', text: 'component ReactView { requires package "react" for runtime }' };
const runtime = { file: 'C:/workspace/expec.json', writable: true,
  text: '{"formatVersion":1,"version":"0.1.0","build":{"entries":["src/view.expec"]},"outputs":[],"packages":[{"alias":"react","name":"npm:react","version":"19.3.0","phases":["runtime"]}]}' };
const testOnly = { ...runtime, text: runtime.text.replace('["runtime"]', '["test"]') };

function authoring() {
  const reports: DocumentReport[] = [];
  const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { reports.push(report); }, clear: () => {} }, { read: () => undefined });
  return { analysis, reports };
}

describe('saved package facts at the live-analysis boundary', () => {
  it('reuses supplied facts and parsing while ordinary edits never reread configuration', () => {
    const { analysis, reports } = authoring();
    const reading = vi.spyOn(ConfigurationReader.prototype, 'read');
    const parsing = vi.spyOn(LangiumReader.prototype, 'read');
    try {
      analysis.opened(view, 1);
      analysis.configurationChanged(runtime);
      expect(reports.at(-1)?.compilation?.value).toBeDefined();
      expect(parsing).toHaveBeenCalledTimes(1);
      analysis.changed({ ...view, text: view.text.replace('ReactView', 'ReactScreen') }, 2);
      expect(reports.at(-1)?.compilation?.value).toBeDefined();
      expect(reading).toHaveBeenCalledTimes(1);
      analysis.configurationChanged({ ...runtime, writable: false });
      expect(reports).toHaveLength(3);
    } finally { reading.mockRestore(); parsing.mockRestore(); }
  });

  it('does not keep a caller-owned configuration as mutable package state', () => {
    const { analysis, reports } = authoring(), configuration = { ...runtime };
    analysis.configurationChanged(configuration);
    configuration.text = testOnly.text;
    analysis.opened(view, 1);
    expect(reports.at(-1)?.compilation?.value).toBeDefined();
    expect(reports.at(-1)?.compilation?.problems).toEqual([]);
  });

  it('does not restore an older catalog when validation receives a newer configuration', () => {
    const { analysis, reports } = authoring();
    const read = ConfigurationReader.prototype.read;
    const reading = vi.spyOn(ConfigurationReader.prototype, 'read').mockImplementationOnce(function (this: ConfigurationReader, source) {
      const result = read.call(this, source);
      analysis.configurationChanged(testOnly);
      return result;
    });
    try {
      analysis.configurationChanged(runtime);
      analysis.opened(view, 1);
      expect(reports.at(-1)?.compilation?.problems.map(problem => problem.code)).toEqual(['unavailable-package']);
      expect(reports.at(-1)?.compilation?.value).toBeUndefined();
    } finally { reading.mockRestore(); }
  });

  it('cannot overwrite newer feedback after a package change reenters publication', () => {
    const reports: Array<{ uri: string; report: DocumentReport }> = [];
    let changeOnNextPublication = false;
    const analysis = new DocumentAnalysis({ publish: (source, _version, report) => {
      reports.push({ uri: source.uri, report });
      if (changeOnNextPublication) { changeOnNextPublication = false; analysis.configurationChanged(testOnly); }
    }, clear: () => {} }, { read: () => undefined });
    const second = { uri: 'file:///workspace/second.expec', text: view.text.replace('ReactView', 'OtherView') };
    analysis.opened(view, 1); analysis.opened(second, 1);
    changeOnNextPublication = true;
    analysis.configurationChanged(runtime);
    const latest = reports.filter(publication => publication.uri === second.uri).at(-1)!.report;
    expect(latest.compilation?.problems.map(problem => problem.code)).toEqual(['unavailable-package']);
    expect(latest.compilation?.value).toBeUndefined();
    expect(reports.filter(publication => publication.uri === second.uri && publication.report.compilation?.value)).toEqual([]);
  });

  it('surfaces a validation exception without publishing fabricated success', () => {
    const { analysis, reports } = authoring(), failure = new Error('Configuration validation failed');
    analysis.opened(view, 1);
    const reading = vi.spyOn(ConfigurationReader.prototype, 'read').mockImplementationOnce(() => { throw failure; });
    try {
      expect(() => analysis.configurationChanged(runtime)).toThrow(failure);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.compilation?.value).toBeUndefined();
    } finally { reading.mockRestore(); }
  });
});

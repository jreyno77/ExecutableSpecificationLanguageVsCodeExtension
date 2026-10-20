import { SourceRename } from '../../src/core/SourceRename.js';
import type { ConnectionConfiguration } from '../../src/core/ConnectionConfiguration.js';
import type { DocumentSources } from '../../src/core/DocumentSources.js';
import type { RenameBuffer } from '../../src/core/RenameBuffer.js';
import type { RenameDocumentEdit } from '../../src/core/RenameDocumentEdit.js';
import type { RenameTarget } from '../../src/core/RenameTarget.js';
import type { RenameWorkspace } from '../../src/core/RenameWorkspace.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';

type RenameReply = { kind: 'returned'; edits: RenameDocumentEdit[] } | { kind: 'refused'; error: unknown };

const manifestFile = 'file:///workspace/expec.json';
// Explicit ownership facts for this fixture's virtual filesystem, not discovered sources.
const ownedPaths = new Map([
  ['file:///workspace/book.expec', 'book.expec'],
  ['file:///workspace/basket.expec', 'basket.expec'],
  ['file:///workspace/first.expec', 'first.expec'],
  ['file:///workspace/second.expec', 'second.expec'],
  ['file:///workspace/store.expec', 'store.expec'],
  ['file:///workspace/saving.expec', 'saving.expec'],
  ['file:///workspace/examples.expec', 'examples.expec'],
  ['file:///workspace/empty.expec', 'empty.expec'],
  ['file:///workspace/missing.expec', 'missing.expec'],
]);

/** Records host facts and the real public rename response; it never resolves source. */
export class SourceRenameRecording {
  private readonly identities = new Map<string, string>([
    ['file:///workspace/book.expec', 'fixture-book'],
    ['file:///workspace/basket.expec', 'fixture-basket'],
    ['file:///workspace/first.expec', 'fixture-first'],
    ['file:///workspace/second.expec', 'fixture-second'],
    ['file:///workspace/store.expec', 'fixture-store'],
    ['file:///workspace/saving.expec', 'fixture-saving'],
    ['file:///workspace/examples.expec', 'fixture-examples'],
    ['file:///workspace/empty.expec', 'fixture-empty'],
    ['file:///workspace/missing.expec', 'fixture-missing'],
  ]);
  private identityChange?: { uri: string; identity: string; observed: boolean; fired: boolean };
  private readonly saved = new Map<string, SourceDocument>();
  private readonly opened = new Map<string, RenameBuffer>();
  private readonly configuration: ConnectionConfiguration;
  private instance?: SourceRename;
  private preparedReply?: RenameTarget;
  private prepareFailure?: { error: unknown };
  private reply?: RenameReply;
  private baseline?: string;
  private requestSources?: ReadonlyMap<string, SourceDocument>;
  private duringRead?: RenameBuffer;

  constructor(entries: readonly string[]) {
    this.configuration = {
      file: manifestFile,
      text: JSON.stringify({ formatVersion: 1, version: '0.1.0', build: { entries: [...entries] }, outputs: [] }),
      writable: true,
    };
  }

  identify(uri: string, identity: string): void { this.identities.set(uri, identity); }
  withholdIdentity(uri: string): void { this.identities.delete(uri); }
  changeIdentityDuringNextRead(uri: string, identity: string): void {
    this.identityChange = { uri, identity, observed: false, fired: false };
  }

  savedSource(source: SourceDocument): void { this.saved.set(source.uri, { ...source }); }
  openedSource(source: SourceDocument, version: number): void {
    if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Fixture document versions must be nonnegative safe integers.');
    this.opened.set(source.uri, { source: { ...source }, version });
  }
  changeDuringNextRead(source: SourceDocument, version: number): void {
    this.duringRead = { source: { ...source }, version };
  }

  prepare(uri: string, version: number, line: number, column: number): void {
    const offset = this.requestOffset(uri, line, column);
    this.beginRequest();
    this.preparedReply = undefined;
    this.prepareFailure = undefined;
    const renamer = this.renamer();
    try {
      const prepared = renamer.prepare(uri, version, offset), captured = this.requestSources?.get(uri);
      if (!captured || prepared.location.source.uri !== uri || prepared.location.source.text !== captured.text) {
        throw new Error('Rename preparation did not return the exact captured requesting source.');
      }
      this.preparedReply = prepared;
    }
    catch (error) { this.prepareFailure = { error }; this.reply = { kind: 'refused', error }; }
    this.verifyIdentityTransition();
  }
  rename(uri: string, version: number, line: number, column: number, newName: string): void {
    const offset = this.requestOffset(uri, line, column);
    this.beginRequest();
    const renamer = this.renamer();
    try { this.reply = { kind: 'returned', edits: renamer.rename(uri, version, offset, newName) }; }
    catch (error) { this.reply = { kind: 'refused', error }; }
    this.verifyIdentityTransition();
  }

  prepared(): RenameTarget {
    if (this.prepareFailure) throw this.prepareFailure.error;
    if (!this.preparedReply) throw new Error('No actual prepare response was recorded.');
    return this.preparedReply;
  }
  changedUris(): string[] { return this.edits().map(edit => edit.source.uri); }
  editVersion(uri: string): number | undefined { return this.documentEdit(uri).version; }
  editHasOpenVersion(uri: string): boolean { return this.documentEdit(uri).version !== undefined; }
  refused(): boolean { return this.reply?.kind === 'refused'; }
  explanationIncludes(text: string): boolean {
    if (this.reply?.kind !== 'refused') return false;
    const error = this.reply.error;
    return (error instanceof Error ? error.message : String(error)).includes(text);
  }
  inputsUnchanged(): boolean {
    if (this.baseline === undefined) throw new Error('No public rename request was recorded.');
    return this.inputFacts() === this.baseline;
  }
  currentText(uri: string): string {
    const source = this.opened.get(uri)?.source ?? this.saved.get(uri);
    if (!source) throw new Error('No current fixture source exists for ' + uri);
    return source.text;
  }
  afterText(uri: string): string {
    const matches = this.edits().filter(edit => edit.source.uri === uri);
    if (matches.length > 1) throw new Error('Rename returned duplicate document edits for ' + uri);
    const document = matches[0];
    if (!document) {
      const original = this.requestSources?.get(uri);
      if (!original) throw new Error('The requested after-text has no captured source: ' + uri);
      return original.text;
    }
    const captured = this.requestSources?.get(uri);
    if (!captured || captured.text !== document.source.text) throw new Error('Rename did not return the exact captured source for ' + uri);
    const text = Array.from(document.source.text);
    let previousStart = text.length + 1;
    for (const edit of document.edits) {
      if (!Number.isSafeInteger(edit.startOffset) || !Number.isSafeInteger(edit.endOffset)
        || edit.startOffset < 0 || edit.endOffset <= edit.startOffset || edit.endOffset > Array.from(document.source.text).length
        || edit.startOffset >= previousStart || edit.endOffset > previousStart) {
        throw new Error('Rename edits must be valid, distinct, nonoverlapping scalar ranges in returned descending order.');
      }
      text.splice(edit.startOffset, edit.endOffset - edit.startOffset, ...Array.from(edit.newText));
      previousStart = edit.startOffset;
    }
    return text.join('');
  }

  private renamer(): SourceRename {
    if (!this.instance) {
      const workspace: RenameWorkspace = {
        configuration: () => ({ ...this.configuration }),
        openDocuments: () => [...this.opened.values()].map(buffer => ({ source: { ...buffer.source }, version: buffer.version })),
      };
      const sources: DocumentSources = {
        localPath: (uri, file) => file === manifestFile ? ownedPaths.get(uri) : undefined,
        read: uri => {
          const identityChange = this.identityChange;
          if (identityChange?.observed && !identityChange.fired) {
            this.identities.set(identityChange.uri, identityChange.identity);
            identityChange.fired = true;
          }
          const source = this.saved.get(uri), change = this.duringRead;
          this.duringRead = undefined;
          if (change) this.openedSource(change.source, change.version);
          return source ? { ...source } : undefined;
        },
      };
      this.instance = new SourceRename(workspace, sources, { keyOf: (uri, file) => {
        const key = file === manifestFile ? this.identities.get(uri) : undefined;
        if (key !== undefined && this.identityChange?.uri === uri) this.identityChange.observed = true;
        return key;
      } });
    }
    return this.instance;
  }
  private verifyIdentityTransition(): void {
    if (this.identityChange && !this.identityChange.fired)
      throw new Error('The scheduled physical identity transition was not exercised by a real source read after keyOf observed the old key.');
  }
  private beginRequest(): void {
    this.reply = undefined;
    this.baseline = this.inputFacts();
    this.requestSources = new Map([...this.saved].map(([uri, source]) => [uri, { ...source }]));
    const sources = new Map(this.requestSources);
    for (const [uri, buffer] of this.opened) sources.set(uri, { ...buffer.source });
    this.requestSources = sources;
  }
  private requestOffset(uri: string, line: number, column: number): number {
    const buffer = this.opened.get(uri);
    if (!buffer) throw new Error('The fixture has no open requesting source: ' + uri);
    const lines = buffer.source.text.split('\n'), selected = lines[line - 1];
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1
      || selected === undefined || column > Array.from(selected).length + 1) throw new RangeError('The authored scalar cursor is outside the current fixture text.');
    return lines.slice(0, line - 1).reduce((offset, text) => offset + Array.from(text).length + 1, 0) + column - 1;
  }
  private edits(): readonly RenameDocumentEdit[] {
    if (!this.reply) return [];
    return this.reply.kind === 'returned' ? this.reply.edits : [];
  }
  private documentEdit(uri: string): RenameDocumentEdit {
    const matches = this.edits().filter(edit => edit.source.uri === uri);
    if (matches.length !== 1) throw new Error('The real rename reply must contain one document edit for ' + uri);
    return matches[0]!;
  }
  private inputFacts(): string {
    return JSON.stringify({
      configuration: this.configuration,
      identities: [...this.identities].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      saved: [...this.saved].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      opened: [...this.opened].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    });
  }
}

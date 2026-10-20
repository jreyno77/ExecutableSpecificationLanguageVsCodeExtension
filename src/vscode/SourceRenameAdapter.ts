import { TextDocument as CapturedTextDocument } from 'vscode-languageserver-textdocument';
import { LSPErrorCodes, ResponseError } from 'vscode-languageserver';
import type { SourceRename } from "../core/SourceRename.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver";
import type { PrepareRenameResult } from "vscode-languageserver";
import type { WorkspaceEdit } from "vscode-languageserver";





/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: vscode-test-electron (test)
 * Depends on: SourceRename
 */
export class SourceRenameAdapter {
    private readonly renamer: SourceRename;
    constructor(renamer: SourceRename) {
        this.renamer = renamer;
    }
    /**
     * Unverified implementation obligation.
     * Convert this exact standard TextDocument's UTF-16 position to a zero-based Unicode-scalar cursor and call core prepare once with the exact URI/version. Reject fractional, negative, out-of-line and surrogate-splitting coordinates rather than clamp. Validate the returned whole authored token against this same captured requesting text before returning the standard prepareRename range/decoded placeholder. Map an explained core refusal to standard LSP RequestFailed, without invented partial success. Native types and coordinate conversion stay here; no source acquisition, parsing, name policy, generation or writes.
     */
    prepare(document: TextDocument, position: Position): PrepareRenameResult {
        return this.explained(() => {
            const text = document.getText(), version = document.version, offset = this.cursor(document, position, text);
            const target = this.renamer.prepare(document.uri, version, offset);
            if (!target || typeof target.name !== 'string' || !target.name.length || target.location?.source?.uri !== document.uri
                || target.location.source.text !== text || document.version !== version || document.getText() !== text) {
                throw new Error('Rename preparation no longer matches the requesting document.');
            }
            const range = this.ranges(document.uri, text)(target.location.startOffset, target.location.endOffset);
            if (offset < target.location.startOffset || offset >= target.location.endOffset) throw new Error('Rename target does not contain the requested cursor.');
            return { range, placeholder: target.name };
        });
    }
    /**
     * Unverified implementation obligation.
     * Convert the current standard document/position once and forward decoded newName unchanged to core rename. Validate all returned exact source/scalar ranges, nonoverlap, distinct document URIs and nonnegative integer optional versions, and requester URI/text/version equality when affected, before producing standard WorkspaceEdit.documentChanges with versioned TextDocumentEdits; saved-only sources have null version. Invalid results refuse the whole edit, never silently filter occurrences or guess saved versions. Preserve actual URI/text/newText and edit ordering. No custom apply, save, selection, parser, resolver or generated output. Standard VS Code owns preview/apply and undo; null-version edits and later preview selection carry no invented atomicity guarantee. Core/provider errors remain observable as explained standard refusal.
     */
    rename(document: TextDocument, position: Position, newName: string): WorkspaceEdit {
        return this.explained(() => {
            const text = document.getText(), version = document.version, offset = this.cursor(document, position, text);
            const changes = this.renamer.rename(document.uri, version, offset, newName);
            if (!Array.isArray(changes)) throw new Error('Rename returned no complete document-edit plan.');
            const seen = new Set<string>();
            const documentChanges = changes.map(change => {
                const source = change?.source;
                if (!source || typeof source.uri !== 'string' || !source.uri.length || typeof source.text !== 'string'
                    || seen.has(source.uri) || !Array.isArray(change.edits)
                    || (change.version !== undefined && (!Number.isInteger(change.version) || change.version < 0))) {
                    throw new Error('Rename returned an invalid or duplicate document edit.');
                }
                seen.add(source.uri);
                if (source.uri === document.uri && (source.text !== text || change.version !== version)) {
                    throw new Error('Rename edit no longer matches the requesting document.');
                }
                const intervals: Array<{ start: number; end: number }> = [];
                const rangeFor = this.ranges(source.uri, source.text);
                const edits = change.edits.map(edit => {
                    if (!edit || typeof edit.newText !== 'string') throw new Error('Rename returned an invalid replacement.');
                    const range = rangeFor(edit.startOffset, edit.endOffset);
                    intervals.push({ start: edit.startOffset, end: edit.endOffset });
                    return { range, newText: edit.newText };
                });
                intervals.sort((left, right) => left.start - right.start);
                if (intervals.some((interval, index) => index > 0 && interval.start < intervals[index - 1].end)) throw new Error('Rename returned overlapping edits.');
                return { textDocument: { uri: source.uri, version: change.version ?? null }, edits };
            });
            if (document.version !== version || document.getText() !== text) throw new Error('Requesting document changed during rename.');
            return { documentChanges };
        });
    }
    private cursor(document: TextDocument, position: Position, text: string): number {
        if (!position || !Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.character < 0) {
            throw new Error('Rename requires an exact nonnegative integer editor position.');
        }
        const offset = document.offsetAt(position), roundTrip = document.positionAt(offset);
        if (roundTrip.line !== position.line || roundTrip.character !== position.character) throw new Error('Rename cursor lies outside the requesting line.');
        const previous = text.charCodeAt(offset - 1), current = text.charCodeAt(offset);
        if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) throw new Error('Rename cursor splits a Unicode character.');
        return Array.from(text.slice(0, offset)).length;
    }
    private ranges(uri: string, text: string): (start: number, end: number) => import('vscode-languageserver').Range {
        const offsets = [0];
        for (const scalar of text) offsets.push(offsets[offsets.length - 1] + scalar.length);
        const captured = CapturedTextDocument.create(uri, 'expec', 0, text);
        return (start, end) => {
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end >= offsets.length) {
                throw new Error('Rename returned an invalid scalar source range.');
            }
            const first = captured.positionAt(offsets[start]), last = captured.positionAt(offsets[end]);
            if (captured.offsetAt(first) !== offsets[start] || captured.offsetAt(last) !== offsets[end]) {
                throw new Error('Rename range cannot be represented exactly by native line positions.');
            }
            return { start: first, end: last };
        };
    }
    private explained<T>(operation: () => T): T {
        try { return operation(); }
        catch (error) {
            if (error instanceof ResponseError && error.code === LSPErrorCodes.RequestFailed) throw error;
            throw new ResponseError(LSPErrorCodes.RequestFailed, error instanceof Error ? error.message : String(error));
        }
    }

}

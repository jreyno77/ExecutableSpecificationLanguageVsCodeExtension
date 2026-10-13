import { TextDocument as ProtocolTextDocument } from 'vscode-languageserver-textdocument';
import type { SourceReferences } from "../core/SourceReferences.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver";
import type { ReferencePresentation } from "./ReferencePresentation.js";




/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: SourceReferences
 */
export class SourceReferenceAdapter {
    private readonly sourceReferences: SourceReferences;
    constructor(references: SourceReferences) {
        this.sourceReferences = references;
    }
    /**
     * Unverified implementation obligation.
     * Translate this exact current standard TextDocument and LSP UTF-16 position to a Unicode-scalar cursor and call SourceReferences.search once with its URI/version and unchanged includeDeclaration flag. Invalid negative, fractional, out-of-line or surrogate-splitting positions return absence without clamping. Absent core results stay absent. Require the reply's requesting URI/text to equal this document. Validate each actual occurrence's finite nonempty scalar range against its supplied captured source before converting it to standard Location; do not guess from spelling, basename or saved files. Invalid replies return absence rather than a partial fabricated success. Preserve the core's ordered distinct locations and plain coverage/prerequisite lists. This adapter performs only protocol/coordinate conversion, never parsing, resolution, compilation, acquisition, scanning, saving or generation. LanguageServerAdapter owns one standard registration and the shared analysis lifetime.
     */
    references(document: TextDocument, position: Position, includeDeclaration: boolean): ReferencePresentation | undefined {
        if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.character < 0) return undefined;
        const text = document.getText(), utf16Offset = document.offsetAt(position), roundTrip = document.positionAt(utf16Offset);
        if (roundTrip.line !== position.line || roundTrip.character !== position.character) return undefined;
        const previous = text.charCodeAt(utf16Offset - 1), current = text.charCodeAt(utf16Offset);
        if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) return undefined;
        const result = this.sourceReferences.search(document.uri, document.version, Array.from(text.slice(0, utf16Offset)).length, includeDeclaration);
        if (!result || result.source?.uri !== document.uri || result.source.text !== text
            || !Array.isArray(result.locations) || !Array.isArray(result.coveredUris) || !Array.isArray(result.prerequisites)
            || !result.coveredUris.every(uri => typeof uri === 'string') || !result.prerequisites.every(value => typeof value === 'string')) return undefined;
        const locations: ReferencePresentation['locations'] = [];
        const captures = new Map<string, { text: string; offsets: number[]; document: TextDocument }>();
        for (const location of result.locations) {
            if (!location?.source || typeof location.source.uri !== 'string' || typeof location.source.text !== 'string'
                || !Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)
                || location.startOffset < 0 || location.endOffset <= location.startOffset) return undefined;
            if (location.source.uri === document.uri && location.source.text !== text) return undefined;
            let captured = captures.get(location.source.uri);
            if (captured && captured.text !== location.source.text) return undefined;
            if (!captured) {
                const offsets = [0];
                for (const scalar of location.source.text) offsets.push(offsets[offsets.length - 1]! + scalar.length);
                captured = { text: location.source.text, offsets,
                    document: ProtocolTextDocument.create(location.source.uri, 'expec', 0, location.source.text) };
                captures.set(location.source.uri, captured);
            }
            const start = captured.offsets[location.startOffset], end = captured.offsets[location.endOffset];
            if (start === undefined || end === undefined) return undefined;
            locations.push({ uri: location.source.uri,
                range: { start: captured.document.positionAt(start), end: captured.document.positionAt(end) } });
        }
        return { locations, coveredUris: [...result.coveredUris], prerequisites: [...result.prerequisites] };
    }
}

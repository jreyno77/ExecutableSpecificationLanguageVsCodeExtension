import type { SyntaxDiagnostic } from "executable-specification-language";
import type { Compilation } from "executable-specification-language";
import type { SourceDocument } from "./SourceDocument.js";



export type DocumentReport = {
    syntax: Array<SyntaxDiagnostic>;
    compilation?: Compilation | undefined;
    sources: Array<SourceDocument>;
    dependencies: Array<string>;
};

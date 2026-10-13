import type { Location } from "vscode-languageserver";

export type ReferencePresentation = {
    locations: Array<Location>;
    coveredUris: Array<string>;
    prerequisites: Array<string>;
};

import type { OutputTab } from "./OutputTab.js";
/** Number profile: JavaScript binary64. */

export type PreviewPublication = {
    uri?: string | undefined;
    version?: number | undefined;
    tabs: Array<OutputTab>;
    message?: string | undefined;
};

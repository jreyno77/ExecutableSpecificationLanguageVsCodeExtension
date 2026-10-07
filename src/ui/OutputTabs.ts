import type { OutputTab } from "../core/OutputTab.js";
export class OutputTabs {
    /**
     * Unverified implementation obligation.
     * Present exactly these tabs, in order, using their IDs, labels and content. A new presentation replaces the previous set. Selecting a tab shows its supplied content; presentation never compiles or generates outputs.
     */
    present(tabs: Array<OutputTab>): void {
        throw new Error("Not implemented: OutputTabs.present");
    }
}

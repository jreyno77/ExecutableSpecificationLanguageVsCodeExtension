import type { OutputTab } from "../core/OutputTab.js";
/**
 * Unverified implementation obligation.
 * Requires package: react (runtime)
 * Requires package: react-dom (runtime)
 * Requires package: typescript (build)
 * Requires package: react-types (build)
 * Requires package: react-dom-types (build)
 * Requires package: vite (build)
 * Requires package: vite (test)
 * Requires package: vite-react (build)
 * Requires package: vite-react (test)
 * Requires package: vitest (test)
 * Requires package: playwright (test)
 */
export class OutputTabs {
    /**
     * Unverified implementation obligation.
     * Present exactly these tabs, in order, using their IDs, labels and content. A new presentation replaces the previous set. Selecting a tab shows its supplied content; presentation never compiles or generates outputs.
     */
    present(tabs: Array<OutputTab>): void {
        throw new Error("Not implemented: OutputTabs.present");
    }

constructor(hostElementId: string) {
        throw new Error("Not implemented: OutputTabs.construction");
    }

/**
     * Unverified implementation obligation.
     * Unmount this view and release its handlers. Keep the supplied host element in the page. Repeated disposal is harmless; present after disposal reports a clear error.
     */
dispose(): void {
        throw new Error("Not implemented: OutputTabs.dispose");
    }
}

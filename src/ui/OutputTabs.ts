import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { OutputTabsView } from './OutputTabsView.js';
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
    private static readonly hosts = new WeakSet<HTMLElement>();
    private readonly host: HTMLElement;
    private readonly root: Root;
    private disposed = false;
    /**
     * Unverified implementation obligation.
     * Present exactly these tabs, in order, using their IDs, labels and content. A new presentation replaces the previous set. Selecting a tab shows its supplied content; presentation never compiles or generates outputs.
     */
    present(tabs: Array<OutputTab>): void {
        if (this.disposed) throw new Error('OutputTabs has been disposed.');
        flushSync(() => this.root.render(createElement(OutputTabsView, { tabs })));
    }

constructor(hostElementId: string) {
        const host = document.getElementById(hostElementId);
        if (!host || host.hasChildNodes() || OutputTabs.hosts.has(host)) throw new Error('OutputTabs requires an existing empty host: ' + hostElementId);
        this.root = createRoot(host);
        this.host = host;
        OutputTabs.hosts.add(host);
    }

/**
     * Unverified implementation obligation.
     * Unmount this view and release its handlers. Keep the supplied host element in the page. Repeated disposal is harmless; present after disposal reports a clear error.
     */
dispose(): void {
        if (this.disposed) return;
        this.root.unmount();
        OutputTabs.hosts.delete(this.host);
        this.disposed = true;
    }
}

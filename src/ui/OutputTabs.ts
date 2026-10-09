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
     * Present exactly the supplied output IDs/labels/order, statuses, explanations and ordered documents. Replace the previous presentation. Preserve selected output ID and document path while retained; otherwise choose the first current item. Show pending, blocked or refused explanations without old documents; ready with no documents visibly says No authored documents. Select documents by their actual paths within one output tab. Display supported text media literally, including TypeScript, Markdown, D2 and JSON. Display image/svg+xml as an inert image from its supplied UTF-8 content, never injected markup or a target-file path. Use a scroll viewport with default 100 percent scale, author-controlled zoom and reset to 100 percent; do not shrink wide images to fit. Dispose replaced image resources and bind image events to the actual content's current node. Unsupported presentation media shows a clear explanation and retains its path/type. Selection and image navigation never compile, generate, write, fetch external resources or implement report freshness.
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
     * Unmount this view and release its handlers and owned image resources. Keep the supplied host element in the page. Repeated disposal is harmless; present after disposal reports a clear error.
     */
dispose(): void {
        if (this.disposed) return;
        this.root.unmount();
        OutputTabs.hosts.delete(this.host);
        this.disposed = true;
    }
}

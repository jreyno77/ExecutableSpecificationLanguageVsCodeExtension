import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { OutputTabsView } from './OutputTabsView.js';
import type { OutputTab } from "../core/OutputTab.js";
/**
 * Unverified implementation obligation.
 * Requires package: react (runtime)
 * Requires package: react-dom (runtime)
 * Requires package: react-markdown (runtime)
 * Requires package: remark-gfm (runtime)
 */
export class OutputTabs {
    private static readonly hosts = new WeakSet<HTMLElement>();
    private readonly host: HTMLElement;
    private readonly root: Root;
    private disposed = false;
    /**
     * Unverified implementation obligation.
     * Present exactly the supplied output IDs/labels/order, statuses, explanations and ordered document paths. Replace the previous presentation. Preserve selected output ID and document path while retained. Otherwise choose the first output, and prefer its first supplied SVG document, then its first Markdown document named Home.md, then its first document. The Home.md filename is the final slash-separated path segment; ties retain supplied order. Show pending, blocked or refused explanations without old documents; ready with no documents visibly says No authored documents.
     * Render text/markdown as a readable document with headings, lists, GFM tables and fenced code. Hide HTML comments, including expec-section, expec-fragment and expec-end ownership markers. Convert only exact generated empty anchors with an expec- prefix and lowercase hexadecimal suffix into inert DOM targets; ignore all other authored HTML and attributes. Code-fenced HTML remains visible code. Never execute authored HTML or load Markdown images; show their alt text instead.
     * Markdown links resolve relative to the selected document among supplied Markdown paths within the same output. Following an available link selects that actual document path and scrolls its decoded fragment target into view; a fragment-only link stays in the current document. Never fetch a missing page or use filesystem or VS Code APIs. External, absolute, command, javascript, file and unavailable-page links remain readable and inactive with the explanation Link unavailable in supplied previews. A missing fragment visibly reports Anchor unavailable in supplied preview.
     * Display TypeScript, JSON and other supported text literally. A D2 document initially shows Diagram preview unavailable. Select an SVG document or show source. Its explicit Show source control reveals the supplied D2 literally. Do not render Markdown, SVG or D2 source as the default document preview.
     * Display image/svg+xml as an inert image from its supplied UTF-8 content, never injected markup or a target-file path. Use a scroll viewport with default 100 percent scale, author-controlled zoom and reset to 100 percent; do not shrink wide images to fit. Dispose replaced image resources and bind image events to the actual content's current node. Unsupported presentation media shows a clear explanation and retains its path/type. Selection, source viewing and document navigation never compile, generate, write, fetch external resources or implement report freshness.
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

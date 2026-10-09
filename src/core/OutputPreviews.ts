import { ConfigurationReader, Outputs, acceptanceOutput, contractListOutput, javaAcceptanceOutput, javaOutput,
    kotlinAcceptanceOutput, kotlinOutput, markdownOutput, pythonAcceptanceOutput, pythonOutput, structureListOutput,
    typescriptOutput, umlOutput, type Configuration, type OutputPreview } from 'executable-specification-language';
import type { OutputTab } from './OutputTab.js';
import type { PreviewPublication } from './PreviewPublication.js';

type CurrentReport = { source: SourceDocument; version: number; report: DocumentReport };
type PreviewView = { report?: CurrentReport; configuration?: Configuration; manifest?: string; publication: PreviewPublication };
type PreviewRequest = { view: PreviewView; output: Configuration['outputs'][number] };
type OutputWork = { running: boolean; queued: PreviewRequest | undefined };

import type { PreviewFeedback } from "./PreviewFeedback.js";
import type { OutputRegistration } from "executable-specification-language";
import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
/** Number profile: JavaScript binary64. */





/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class OutputPreviews {
    private readonly feedback: PreviewFeedback;
    private readonly outputs = new Outputs();
    private readonly reader: ConfigurationReader;
    private readonly reports = new Map<string, CurrentReport>();
    private readonly work = new Map<string, OutputWork>();
    private configuration: Configuration | undefined;
    private configurationToken = {};
    private manifest: string | undefined;
    private configurationMessage = 'Choose a saved .expec configuration to preview outputs.';
    private selection: string | undefined;
    private view: PreviewView | undefined;
    private disposed = false;

    constructor(feedback: PreviewFeedback, registrations: Array<OutputRegistration> | undefined) {
        this.feedback = feedback;
        for (const output of registrations ?? [typescriptOutput, markdownOutput, umlOutput, contractListOutput, structureListOutput,
            acceptanceOutput, javaOutput, javaAcceptanceOutput, kotlinOutput, kotlinAcceptanceOutput, pythonOutput, pythonAcceptanceOutput]) {
            this.outputs.register(output);
        }
        this.reader = new ConfigurationReader(this.outputs.profiles);
    }
    /**
     * Unverified implementation obligation.
     * Capture this current saved manifest or absence and advance private currentness before further work. Prepare the real Outputs registry and ConfigurationReader from supplied registrations, or shipped built-ins when absent. An explicit list replaces built-ins. Validate through ConfigurationReader without discovering files. Missing/invalid configuration withdraws old tabs with its actual explanation. Preserve configured output IDs/order/options; duplicate IDs remain a configuration error. Changed options replace queued requests. Valid outputs may preview without a project or with an unavailable target; target availability is not authored-preview readiness. Use this absolute native manifest filename as OutputContext.manifestLocation. Do not install, capture targets, rewrite configuration or request generation.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined): void {
        if (this.disposed) return;
        const token = this.configurationToken = {};
        this.view = undefined;
        for (const work of this.work.values()) work.queued = undefined;
        this.configuration = undefined;
        this.manifest = configuration?.file;
        this.configurationMessage = 'Choose a saved .expec configuration to preview outputs.';
        if (configuration?.text !== undefined) {
            try {
                const checked = this.reader.read({ sourceId: configuration.file, text: configuration.text });
                if (this.disposed || this.configurationToken !== token) return;
                this.configuration = checked.value;
                this.configurationMessage = this.findings(checked) || 'Configuration is unavailable.';
            } catch (error) {
                if (this.disposed || this.configurationToken !== token) return;
                this.configurationMessage = 'Configuration failed: ' + this.explanation(error);
            }
        }
        this.refresh();
    }
    /**
     * Unverified implementation obligation.
     * Select the exact authored document URI or absence, advancing private currentness. Retain current reports for open documents so switching selections requires no recompile. A selected document without a current report has a visible waiting explanation. A preview panel taking focus is not a new authored selection. Selection replaces queued requests and cannot let a previous document's completion restore old content.
     */
    selected(uri: string | undefined): void {
        if (this.disposed) return;
        this.selection = uri;
        this.refresh();
    }
    /**
     * Unverified implementation obligation.
     * Receive the real current immutable DocumentAnalysis publication before native diagnostic conversion loses its Compilation. Keep the source/version and complete report inside core; never parse, compile, discover files or rebuild models here. Each publication is a new private report revision even at the same editor version after imported-source changes. Only the selected current report drives previews. Rejected syntax or absent/failed/deferred Compilation blocks configured tabs with actual syntax/compiler codes/messages or requirement reasons/requires and no old documents. From its checked Specification call public Outputs.preview independently for each configured ID/options with captured report source URIs as workspaceModules and the selected manifest filename. Publish pending tabs with no previous documents before starting work; each current completion updates only its tab while others progress. Retain actual document paths/media types/order. Strictly decode supported UTF-8 text media, application/json and image/svg+xml from their exact byte spans; invalid UTF-8 or unsupported binary presentation refuses that output with an explicit unsupported-presentation explanation and no silent replacement. Successful empty documents are ready with No authored documents; refused checks retain actual diagnostic codes/messages or requirement reasons/requires. Provider/contract exceptions are visibly refused rather than fabricated upstream findings or empty success. Status is pending, ready, blocked or refused. Private work currentness covers source lifetime/version, report/configuration/selection revisions and coordinator lifetime; check it after every await and discard stale success/refusal/error. Keep at most one invocation per output ID in flight and only its latest requested report/configuration queued; after settlement render that latest request and skip superseded intermediate edits. Other IDs progress independently. Do not open project adapters, capture a target, plan/apply writes, generate acceptance output, execute scenarios or claim handwritten preservation/write readiness.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        if (this.disposed) return;
        this.reports.set(source.uri, { source: Object.freeze({ uri: source.uri, text: source.text }), version, report });
        if (this.selection === source.uri) this.refresh();
    }
    /**
     * Unverified implementation obligation.
     * Forget this open report lifetime, clear selection if it owns the selected source, invalidate pending work and clear queued requests for it. Later old completions cannot publish. Reopening the same URI may start at a lower version and is a distinct report lifetime. Other retained open reports remain usable.
     */
    closed(uri: string): void {
        if (this.disposed) return;
        this.reports.delete(uri);
        if (this.selection === uri) {
            this.selection = undefined;
            this.refresh();
        }
    }
    /**
     * Unverified implementation obligation.
     * End this coordinator lifetime, clear retained reports/queued work and prevent new invocations or later publication. Repeated disposal is harmless. Already started callbacks have rejection handlers and settle through their own cleanup; this operation does not claim synchronous worker termination. Real UML callbacks own one engine per invocation, reuse it across documents and dispose before settlement.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.view = undefined;
        this.reports.clear();
        for (const work of this.work.values()) work.queued = undefined;
        this.configuration = undefined;
        this.selection = undefined;
    }
    private refresh(): void {
        for (const work of this.work.values()) work.queued = undefined;
        const report = this.selection === undefined ? undefined : this.reports.get(this.selection);
        const view: PreviewView = {
            ...(report ? { report } : {}), ...(this.configuration ? { configuration: this.configuration } : {}),
            ...(this.manifest === undefined ? {} : { manifest: this.manifest }),
            publication: { ...(this.selection === undefined ? {} : { uri: this.selection }), ...(report ? { version: report.version } : {}), tabs: [] },
        };
        this.view = view;
        if (!view.configuration) view.publication.message = this.configurationMessage;
        else if (this.selection === undefined) view.publication.message = 'Select an authored .expec document to preview.';
        else if (!report) view.publication.message = 'Waiting for analysis of the selected authored document.';
        else {
            const compilation = report.report.compilation;
            const blocked = report.report.syntax.length || !compilation?.value || compilation.problems.length || compilation.deferred.length || compilation.syntax.length;
            const message = [...new Set([
                ...report.report.syntax, ...(compilation?.syntax ?? []),
            ].map(item => item.category + ': ' + item.explanation).concat(compilation ? this.findings(compilation) : []).filter(Boolean))].join('; ')
                || 'Compilation is unavailable.';
            view.publication.tabs = view.configuration.outputs.map(output => ({
                id: output.id, label: this.label(output.id), status: blocked ? 'blocked' : 'pending', documents: [],
                ...(blocked ? { message } : {}),
            }));
            if (!view.publication.tabs.length) view.publication.message = 'No outputs configured.';
        }
        this.present(view);
        // Feedback can select, reconfigure, publish a newer report or dispose synchronously.
        if (this.disposed || this.view !== view || !view.report || !view.configuration) return;
        for (const output of view.configuration.outputs) {
            if (this.disposed || this.view !== view) return;
            if (view.publication.tabs.find(tab => tab.id === output.id)?.status !== 'pending') continue;
            const work = this.work.get(output.id) ?? { running: false, queued: undefined };
            this.work.set(output.id, work);
            work.queued = { view, output };
            this.start(work);
        }
    }
    private current(request: PreviewRequest): boolean {
        return !this.disposed && this.view === request.view;
    }
    private start(work: OutputWork): void {
        if (this.disposed || work.running || !work.queued) return;
        const request = work.queued;
        work.queued = undefined;
        if (!this.current(request)) return;
        work.running = true;
        const settled = () => { work.running = false; this.start(work); };
        void this.render(request).then(tab => {
            if (!this.current(request)) return;
            this.complete(request, tab);
        }, error => {
            if (!this.current(request)) return;
            this.complete(request, { id: request.output.id, label: this.label(request.output.id), status: 'refused', documents: [],
                message: 'Output preview failed: ' + this.explanation(error) });
        }).then(settled, error => {
            settled();
            // Presentation errors belong to the feedback consumer, not to an upstream output finding.
            queueMicrotask(() => { throw error; });
        });
    }
    private async render(request: PreviewRequest): Promise<OutputTab> {
        const view = request.view;
        const result = await this.outputs.preview(request.output.id, request.output.options, view.report!.report.compilation!.value!, {
            workspaceModules: [...new Set(view.report!.report.sources.map(source => source.uri))],
            ...(view.manifest === undefined ? {} : { manifestLocation: view.manifest }),
        });
        if (!this.current(request)) return { id: request.output.id, label: this.label(request.output.id), status: 'pending', documents: [] };
        const tab: OutputTab = { id: request.output.id, label: this.label(request.output.id), status: 'refused', documents: [] };
        if (!result.value) { tab.message = this.findings(result) || 'Output preview was refused.'; return tab; }
        try {
            tab.documents = this.documents(result.value);
            tab.status = 'ready';
            if (!tab.documents.length) tab.message = 'No authored documents';
        } catch (error) {
            tab.documents = [];
            tab.message = 'unsupported-presentation: ' + this.explanation(error);
        }
        return tab;
    }
    private documents(preview: OutputPreview): NonNullable<OutputTab['documents']> {
        return preview.documents.map(document => {
            const media = document.mediaType.split(';')[0]!.trim().toLowerCase();
            if (!media.startsWith('text/') && media !== 'application/json' && media !== 'image/svg+xml') {
                throw new TypeError('Unsupported document media type: ' + document.mediaType);
            }
            return { path: document.path, mediaType: document.mediaType, content: new TextDecoder('utf-8', { fatal: true }).decode(document.bytes) };
        });
    }
    private complete(request: PreviewRequest, tab: OutputTab): void {
        request.view.publication.tabs = request.view.publication.tabs.map(previous => previous.id === tab.id ? tab : previous);
        this.present(request.view);
    }
    private present(view: PreviewView): void {
        if (this.disposed || this.view !== view) return;
        const publication = structuredClone(view.publication);
        for (const tab of publication.tabs) {
            for (const document of tab.documents ?? []) Object.freeze(document);
            Object.freeze(tab.documents);
            Object.freeze(tab);
        }
        Object.freeze(publication.tabs);
        this.feedback.present(Object.freeze(publication));
    }
    private findings(check: { problems: readonly { code: string; message: string }[]; deferred: readonly { reason: string; requires: string }[] }): string {
        return [...check.problems.map(problem => problem.code + ': ' + problem.message),
            ...check.deferred.map(requirement => requirement.reason + ': ' + requirement.requires)].join('; ');
    }
    private explanation(error: unknown): string { return error instanceof Error ? error.message : String(error); }
    private label(id: string): string {
        switch (id) {
            case 'uml': return 'UML';
            case 'typescript': return 'TypeScript';
            case 'markdown': return 'Markdown';
            default: return id;
        }
    }

}

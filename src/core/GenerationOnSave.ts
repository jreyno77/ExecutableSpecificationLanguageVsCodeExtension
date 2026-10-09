import { GenerationInputs, explanation } from './generation-inputs.js';
import type { Configuration } from 'executable-specification-language';
import type { GenerationRequest } from './GenerationRequest.js';
import type { GenerationResult } from './GenerationResult.js';
import type { GenerationState } from './GenerationState.js';
import type { GenerationWriteProblem } from './GenerationWriteProblem.js';

type SaveIntent = { request: GenerationRequest; lifetime: number; configuration?: Configuration };
type GenerationRun = { intent: SaveIntent; valid: boolean; started: boolean; cancelRequested: boolean; finished: boolean; root?: string };

import type { GenerationWorker } from "./GenerationWorker.js";
import type { GenerationFiles } from "./GenerationFiles.js";
import type { GenerationFeedback } from "./GenerationFeedback.js";
import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { SourceDocument } from "./SourceDocument.js";
/** Number profile: JavaScript binary64. */





/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class GenerationOnSave {
    private readonly worker: GenerationWorker;
    private readonly feedback: GenerationFeedback;
    private readonly inputs: GenerationInputs;
    private configuration: Readonly<ConnectionConfiguration> | undefined;
    private enabled = false;
    private lifetime = 0;
    private configured = false;
    private disposed = false;
    private checking = false;
    private editorRevision = 0;
    private candidate: SaveIntent | undefined;
    private currentIntent: SaveIntent | undefined;
    private queued: SaveIntent | undefined;
    private running: GenerationRun | undefined;
    constructor(worker: GenerationWorker, files: GenerationFiles, feedback: GenerationFeedback) {
        this.worker = worker;
        this.feedback = feedback;
        this.inputs = new GenerationInputs(files);
    }
    /**
     * Unverified implementation obligation.
     * Capture the selected saved manifest and its explicit opt-in. Absence or a different filename withdraws the prior lifetime; enabled never transfers to another manifest. Missing opt-in means disabled, independently of writable or connected status. Changed selection/text/enablement cancels obsolete work and clears its queue. Never rewrite configuration, install or build merely because configuration or enablement changed.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined, enabled: boolean): void {
        if (this.disposed) return;
        const optedIn = configuration !== undefined && enabled;
        const changed = !this.configured || this.configuration?.file !== configuration?.file || this.configuration?.text !== configuration?.text || this.enabled !== optedIn;
        this.configuration = configuration === undefined ? undefined : Object.freeze({ file: configuration.file, text: configuration.text, writable: configuration.writable });
        this.enabled = optedIn;
        this.configured = true;
        if (!changed) return;
        const lifetime = ++this.lifetime;
        this.candidate = undefined;
        this.currentIntent = undefined;
        this.queued = undefined;
        this.cancelRunning();
        if (this.lifetime !== lifetime) return;
        this.present(undefined, optedIn ? 'idle' : 'disabled', optedIn ? 'Generation will run after a configured source is saved.' : 'Generation on save is disabled for this configuration.');
    }
    /**
     * Unverified implementation obligation.
     * Reject a nonpositive or noninteger version with RangeError before changing state. Capture this actual local .expec post-save snapshot. Reject a missing/disabled connection, mismatched actual saved source/configuration bytes or a different current clean buffer, with an explanation and no new worker. Validate through the real registered ConfigurationReader, resolving entries from its actual manifest source URI. A save must belong to an actual configured entry or its saved import closure, established through real saved-source acquisition, public LangiumReader models and SourceComposer composition, not source-name guessing or a single-entry DocumentReport. An unrelated .expec save creates no build. The SDK full build owns remaining prerequisites and invalid compilation findings. Present built only for an actual successful complete build result; preserve actual refused/failed/cancelled findings and partial receipts. Superseded results are recorded but cannot replace current state. Start at most one full saved build for this connection. While it runs, keep only the latest save, cancel the obsolete run and wait for its settlement before starting that latest request after fresh checks. Repeated later saves can retry at the same editor version. Never feed a selected DocumentReport as a full build.
     */
    sourceSaved(source: SourceDocument, version: number): void {
        if (!Number.isInteger(version) || version <= 0) throw new RangeError('Saved document versions must be positive integers.');
        if (this.disposed) return;
        const request: GenerationRequest = { configuration: Object.freeze({ ...this.configuration ?? { file: '', writable: false } }),
            source: Object.freeze({ uri: source.uri, text: source.text }), version };
        const intent: SaveIntent = { request: Object.freeze(request), lifetime: this.lifetime };
        if (!this.configuration || !this.enabled) {
            this.present(intent, this.configuration ? 'disabled' : 'blocked', this.configuration ? 'Generation on save is disabled for this configuration.' : 'Choose a saved project configuration before generating.');
            return;
        }
        this.candidate = intent;
        void this.admit(intent).catch(error => { if (this.candidate === intent && this.live(intent)) this.block(intent, [{ code: 'generation-admission-failed', path: request.configuration.file, message: explanation(error) }]); });
    }
    /**
     * Unverified implementation obligation.
     * Inspect fresh GenerationFiles facts. An edit/close of the triggering source, dirty selected manifest, any observed dirty .expec buffer or dirty ordinary buffer within the actual SDK target root invalidates the pending save and requests cancellation. Logical/canonical root aliases are checked conservatively; uncertain classification is an explained refusal. Unrelated buffer changes create no build. Only sourceSaved creates a generation intent; generated filesystem notifications still reach existing analysis/writer freshness checks without becoming new save intents or being globally muted. Each SDK permission query rechecks current facts.
     */
    editorChanged(): void {
        this.editorRevision++;
        if (this.disposed || this.checking) return;
        const candidate = this.candidate, queued = this.queued, current = this.currentIntent, running = this.running;
        const intents = new Set([queued, running && this.current(running) ? running.intent : undefined, candidate]);
        for (const intent of intents) {
            if (!intent?.configuration || !this.live(intent)) continue;
            const problems = this.inspect(intent, running?.intent === intent ? running.root : undefined);
            if (this.candidate !== candidate || this.queued !== queued || this.currentIntent !== current || this.running !== running) return;
            if (problems.length && this.live(intent)) { this.block(intent, problems); return; }
        }
    }
    /**
     * Unverified implementation obligation.
     * End this lifetime, clear queued saves and request cancellation once. Start no later work or current-state publication; retain actual terminal effect records. Native ownership uses GenerationWorker.dispose completion to await worker/process cleanup and keep effect recording alive until settlement. No synchronous termination or automatic rollback is promised.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.lifetime++;
        this.candidate = undefined;
        this.currentIntent = undefined;
        this.queued = undefined;
        this.cancelRunning();
    }
    private live(intent: SaveIntent): boolean {
        return !this.disposed && intent.lifetime === this.lifetime && this.enabled
            && this.configuration?.file === intent.request.configuration.file && this.configuration.text === intent.request.configuration.text;
    }
    private pending(intent: SaveIntent, queued: boolean): boolean { return this.live(intent) && (queued ? this.queued === intent : this.candidate === intent); }
    private async admit(intent: SaveIntent, queued = false): Promise<void> {
        if (!this.pending(intent, queued)) return;
        intent.configuration = this.inputs.configuration(intent.request);
        let problems = this.inspect(intent);
        if (!this.pending(intent, queued)) return;
        if (problems.length) { this.block(intent, problems); return; }
        const member = await this.inputs.member(intent.request, intent.configuration);
        if (!this.pending(intent, queued)) return;
        problems = this.inspect(intent);
        if (!this.pending(intent, queued)) return;
        if (problems.length) { this.block(intent, problems); return; }
        if (!member) {
            if (this.candidate === intent) this.candidate = undefined;
            if (!this.running) this.present(intent, 'idle', 'This saved document is outside the configured build entries and imports.');
            return;
        }
        if (!queued) {
            this.currentIntent = intent;
            this.queued = intent;
        }
        if (this.running) {
            this.cancelRunning();
            this.present(intent, 'queued', 'Waiting for the previous generation to settle before building this latest save.');
        } else this.start(intent);
    }
    private inspect(intent: SaveIntent, root?: string): GenerationWriteProblem[] {
        if (!this.live(intent)) return [{ code: 'generation-obsolete', path: root ?? intent.request.configuration.file, message: 'The save or connection lifetime is no longer current.' }];
        const revision = this.editorRevision;
        const previous = this.checking;
        this.checking = true;
        let problems: GenerationWriteProblem[];
        try { problems = this.inputs.problems(intent.request, intent.configuration!, root); }
        finally { this.checking = previous; }
        if (!this.live(intent) || revision !== this.editorRevision) return [{ code: 'generation-obsolete', path: root ?? intent.request.configuration.file, message: 'Editor or connection facts changed while checking permission.' }];
        return problems;
    }
    private start(intent: SaveIntent): void {
        if (!this.live(intent) || this.currentIntent !== intent || this.queued !== intent || this.running) return;
        const problems = this.inspect(intent);
        if (!this.live(intent) || this.currentIntent !== intent || this.queued !== intent || this.running) return;
        if (problems.length) { this.block(intent, problems); return; }
        this.queued = undefined;
        const run: GenerationRun = { intent, valid: true, started: false, cancelRequested: false, finished: false };
        this.running = run;
        this.present(intent, 'generating', 'Building the complete saved configuration.');
        if (!this.current(run)) { if (this.running === run) this.running = undefined; this.next(); return; }
        run.started = true;
        try {
            this.worker.start(intent.request, {
                writeProblems: root => this.writeProblems(run, root),
                finished: result => this.finished(run, result),
            });
        } catch (error) { this.finished(run, { report: '', error: explanation(error) }); }
    }
    private current(run: GenerationRun): boolean { return run.valid && !run.finished && this.live(run.intent) && this.currentIntent === run.intent && this.running === run; }
    private writeProblems(run: GenerationRun, root: string): GenerationWriteProblem[] {
        if (!this.current(run)) return [{ code: 'generation-obsolete', path: root, message: 'This generation no longer belongs to the current save and connection.' }];
        const problems = this.inspect(run.intent, root);
        if (!this.current(run)) return [{ code: 'generation-obsolete', path: root, message: 'The generation changed while permission was checked.' }];
        if (problems.length) this.block(run.intent, problems);
        else run.root = root;
        return problems.map(problem => ({ code: problem.code, path: problem.path, message: problem.message }));
    }
    private block(intent: SaveIntent, problems: GenerationWriteProblem[]): void {
        if (!this.live(intent)) return;
        this.candidate = undefined;
        this.queued = undefined;
        this.currentIntent = undefined;
        this.cancelRunning();
        this.present(intent, 'blocked', problems.map(problem => problem.code + ': ' + problem.message).join('; '));
    }
    private cancelRunning(): void {
        const run = this.running;
        if (!run) return;
        run.valid = false;
        if (run.started && !run.cancelRequested && !run.finished) { run.cancelRequested = true; this.worker.cancel(); }
    }
    private finished(run: GenerationRun, result: GenerationResult): void {
        if (run.finished) return;
        const current = this.current(run);
        run.finished = true;
        if (this.running === run) this.running = undefined;
        const captured: GenerationResult = Object.freeze({ report: result.report,
            ...(result.runtimeVersion === undefined ? {} : { runtimeVersion: result.runtimeVersion }),
            ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }), ...(result.error === undefined ? {} : { error: result.error }) });
        this.feedback.record(run.intent.request.configuration.file, captured);
        if (current && this.live(run.intent) && this.currentIntent === run.intent) {
            const terminal = this.terminal(captured);
            this.present(run.intent, terminal.status, terminal.message);
        }
        this.next();
    }
    private next(): void {
        const intent = this.queued;
        if (!intent || this.running || !this.live(intent)) return;
        // Let the worker's finished callback unwind before a new owned start.
        setImmediate(() => { if (!this.running && this.queued === intent && this.live(intent)) void this.admit(intent, true)
            .catch(error => { if (this.queued === intent && this.live(intent)) this.block(intent, [{ code: 'generation-admission-failed', path: intent.request.configuration.file, message: explanation(error) }]); }); });
    }
    private terminal(result: GenerationResult): Pick<GenerationState, 'status' | 'message'> {
        if (result.error) return { status: 'failed', message: result.error };
        try {
            const report = JSON.parse(result.report) as { format?: unknown; command?: unknown; status?: unknown; exitCode?: unknown;
                problems?: { code: string; message: string }[]; syntax?: { category: string; explanation: string }[]; deferred?: { reason: string; requires: string }[] };
            if (report.format !== 1 || report.command !== 'build' || !Array.isArray(report.problems) || !Array.isArray(report.syntax) || !Array.isArray(report.deferred)) throw Error('The worker did not return a complete SDK build report.');
            const findings = [...report.problems.map(problem => problem.code + ': ' + problem.message),
                ...report.syntax.map(problem => problem.category + ': ' + problem.explanation), ...report.deferred.map(problem => problem.reason + ': ' + problem.requires)].join('; ');
            if (result.exitCode === 0 && report.exitCode === 0 && report.status === 'built' && !findings) return { status: 'built', message: 'The complete saved build finished successfully.' };
            if (result.exitCode === 130 || report.status === 'cancelled') return { status: 'cancelled', message: findings || 'Generation was cancelled; its actual effects remain in the build report.' };
            return { status: ['invalid', 'action-required', 'usage-error'].includes(String(report.status)) ? 'blocked' : 'failed', message: findings || 'Generation finished with SDK status ' + String(report.status) + '.' };
        } catch (error) { return { status: 'failed', message: 'Generation report unavailable: ' + explanation(error) }; }
    }
    private present(intent: SaveIntent | undefined, status: string, message: string): void {
        if (this.disposed || intent && intent.lifetime !== this.lifetime) return;
        this.feedback.present(Object.freeze({ ...(this.configuration ? { configurationFile: this.configuration.file } : {}),
            ...(intent ? { sourceUri: intent.request.source.uri, sourceVersion: intent.request.version } : {}), status, message }));
    }

}

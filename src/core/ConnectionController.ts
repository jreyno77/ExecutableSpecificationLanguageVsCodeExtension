import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
    ConfigurationReader, ProjectConnector, acceptanceOutput, contractListOutput,
    javaAcceptanceOutput, javaOutput, kotlinAcceptanceOutput, kotlinOutput,
    markdownOutput, pythonAcceptanceOutput, pythonOutput, structureListOutput,
    typescriptOutput, umlOutput, type Configuration,
} from 'executable-specification-language';
import type { ConnectionState } from './ConnectionState.js';
import type { ConnectionFeedback } from "./ConnectionFeedback.js";
import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { ConnectionWorkFeedback } from "./ConnectionWorkFeedback.js";

import type { ConnectionOutputChoice } from "./ConnectionOutputChoice.js";
import type { ConnectionGuidance } from "./ConnectionGuidance.js";




/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: node-types (build)
 * Requires package: vitest (test)
 */
export class ConnectionController {
    constructor(feedback: ConnectionFeedback) {
        this.feedback = feedback;
    }
    /**
     * Unverified implementation obligation.
     * Capture this exact saved text and write safety for one selected local manifest. Advance currentness before any asynchronous work and withdraw the old connected state while checking. Missing text is unconfigured. Validate existing text with the real ConfigurationReader and registered built-in output profiles; invalid configuration stays invalid with its real diagnostic message and is never rewritten. Use ProjectConnector.connect with this absolute manifest filename. A valid configuration without a project is unconfigured; an unavailable root is unavailable; only an actual connected result establishes connected and verifiedDirectory. Preserve logical target and canonical verified directory separately. An explicit disconnect remains suspended across saved changes to this same manifest and target events; selecting a different manifest starts its own unsuspended selection. Forward current active work only through the attached work observer, with absence before obsolete work can continue. Do not scan or capture a project, install packages, generate outputs or parse native project code. Only the latest configuration/target revision may publish.
     */
    configurationChanged(snapshot: ConnectionConfiguration): void {
        if (this.disposed) return;
        this.requireAbsolute(snapshot.file, 'configuration filename');
        const captured = Object.freeze({ file: snapshot.file, text: snapshot.text, writable: snapshot.writable });
        const resume = this.pending?.purpose === 'create' && this.pending.previous.file === captured.file
            && this.pending.text === captured.text;
        const suspended = this.snapshot?.file === captured.file && this.suspended && !resume;
        const revision = this.advance();
        if (!this.current(revision)) return;
        this.snapshot = captured;
        this.suspended = suspended;
        this.configuration = undefined;
        this.raw = undefined;
        this.canonical = undefined;
        this.canonicalIdentity = undefined;
        this.guidanceFacts = undefined;
        this.configurationProblem = '';
        if (captured.text === undefined) {
            this.prepareGuidance();
            this.present(revision, 'unconfigured', undefined, 'Choose a project to set up a connection.');
            return;
        }
        const checked = this.reader.read({ sourceId: captured.file, text: captured.text });
        if (!checked.value) {
            this.configurationProblem = checked.problems.map(problem => problem.message).join(' ');
            this.present(revision, 'invalid', undefined, this.configurationProblem);
            return;
        }
        this.configuration = checked.value;
        this.raw = JSON.parse(captured.text) as Record<string, unknown>;
        this.prepareGuidance();
        this.checkSaved(revision);
    }
    /**
     * Unverified implementation obligation.
     * Choose an absolute native directory for the current selected configuration. Reject invalid existing configuration without rewriting it. If writable is false, preserve the current target, request no save and present the message Save or revert unsaved configuration edits before choosing a project. Verify the proposed directory through the real connector before requesting persistence. A missing or unusable directory remains unavailable and requests no save. Preserve every other existing JSON field; change only project.root. For a missing manifest, propose formatVersion 1, version 0.1.0, build.entries [src/main.expec] and outputs []. This is this extension's explicit initial metadata setting, not a language default; connection does not check whether that source file exists, and authors must configure their actual build entry before compilation, with the selected root. Never write the file itself or report the new project connected before actual saved confirmation. Pass an immutable captured previous snapshot to feedback. New configuration or target revisions invalidate older verification and any unsent write request.
     */
    chooseProject(directory: string): void {
        if (this.disposed || !this.snapshot) return;
        this.requireAbsolute(directory, 'project directory');
        if (this.snapshot.text !== undefined && !this.configuration) {
            this.present(this.revision, 'invalid', undefined, this.configurationProblem);
            return;
        }
        if (!this.snapshot.writable) {
            this.publish(this.revision, Object.freeze({
                ...(this.state ?? { configurationFile: this.snapshot.file, status: 'unconfigured' }),
                message: 'Save or revert unsaved configuration edits before choosing a project.',
            }));
            return;
        }
        const previous = Object.freeze({ ...this.snapshot });
        const raw = { ...(this.raw ?? { formatVersion: 1, version: '0.1.0', build: { entries: ['src/main.expec'] }, outputs: [] }), project: { root: directory } };
        const text = JSON.stringify(raw);
        const checked = this.reader.read({ sourceId: previous.file, text });
        const revision = this.advance();
        if (!this.current(revision)) return;
        if (!checked.value) {
            this.present(revision, 'invalid', directory, checked.problems.map(problem => problem.message).join(' '));
            return;
        }
        this.candidate = directory;
        void this.verify(revision, previous, checked.value, directory, { text, purpose: 'choose' });
    }
    /**
     * Unverified implementation obligation.
     * Recheck the current configured target automatically after relevant logical or canonical root or ancestor events, including deletion and restoration. Ignore unrelated paths and events for a superseded target, and never resume an explicitly disconnected session from watcher events. Reuse validated current configuration; perform only connector identity/availability checking, not tree capture. Withdraw connected while rechecking and suppress stale completion.
     */
    targetChanged(path: string): void {
        if (this.disposed || !this.snapshot || this.suspended || this.pending) return;
        const target = this.configuredTarget();
        if (![target, this.canonical, this.candidate].some(root => root !== undefined && this.ancestor(path, root))) return;
        const revision = this.advance(false);
        if (this.current(revision)) this.checkSaved(revision);
    }
    /**
     * Unverified implementation obligation.
     * For the exact previous object of the current pending save request, report unavailable with this host failure message; never pretend the requested configuration was saved or connected. Ignore failures from superseded requests.
     */
    saveFailed(previous: ConnectionConfiguration, message: string): void {
        if (this.disposed || this.pending?.previous !== previous) return;
        const target = this.pending.target;
        const revision = this.advance();
        if (this.current(revision)) this.present(revision, 'unavailable', target, message);
    }
    /**
     * Unverified implementation obligation.
     * End this controller lifetime, invalidate pending asynchronous work and prevent later publication or save requests. Withdraw and release the attached work observer even if another cleanup callback fails. Repeated disposal is harmless; the native caller owns watchers and view registrations.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.revision++;
        const observer = this.workObserver;
        this.workObserver = undefined;
        this.observerRevision++;
        this.activeWork = undefined;
        this.pending = undefined;
        this.candidate = undefined;
        this.snapshot = undefined;
        this.configuration = undefined;
        this.raw = undefined;
        this.canonical = undefined;
        this.canonicalIdentity = undefined;
        this.state = undefined;
        this.guidanceFacts = undefined;
        observer?.feedback.configurationChanged(undefined);
    }
    private readonly feedback: ConnectionFeedback;
    private readonly reader = new ConfigurationReader([
        typescriptOutput, markdownOutput, umlOutput, contractListOutput, structureListOutput,
        acceptanceOutput, javaOutput, javaAcceptanceOutput, kotlinOutput, kotlinAcceptanceOutput,
        pythonOutput, pythonAcceptanceOutput,
    ]);
    private snapshot: Readonly<ConnectionConfiguration> | undefined;
    private configuration: Configuration | undefined;
    private raw: Record<string, unknown> | undefined;
    private state: Readonly<ConnectionState> | undefined;
    private canonical: string | undefined;
    private canonicalIdentity: string | undefined;
    private candidate: string | undefined;
    private pending: { previous: ConnectionConfiguration; target: string | undefined; text: string; purpose: 'choose' | 'create' | 'delete' } | undefined;
    private guidanceFacts: ConnectionGuidance | undefined;
    private suspended = false;
    private observerRevision = 0;
    private workObserver: { feedback: ConnectionWorkFeedback; delivered: boolean; configuration?: ConnectionConfiguration } | undefined;
    private activeWork: { configuration: ConnectionConfiguration; target: string; canonical: string; identity: string } | undefined;
    private configurationProblem = '';
    private revision = 0;
    private disposed = false;

    private advance(withdraw = true): number {
        const revision = ++this.revision;
        this.pending = undefined;
        this.candidate = undefined;
        if (withdraw) {
            this.activeWork = undefined;
            this.deliverWork(revision, undefined);
        }
        return revision;
    }
    private current(revision: number): boolean { return !this.disposed && this.revision === revision; }
    private configuredTarget(): string | undefined {
        return this.snapshot && this.configuration?.project
            ? resolve(dirname(this.snapshot.file), this.configuration.project.root) : undefined;
    }
    private checkSaved(revision: number): void {
        if (!this.current(revision)) return;
        const snapshot = this.snapshot;
        const configuration = this.configuration;
        const target = this.configuredTarget();
        if (snapshot?.text !== undefined && !configuration) {
            this.present(revision, 'invalid', undefined, this.configurationProblem);
            return;
        }
        if (!snapshot || !configuration || !target) {
            this.present(revision, 'unconfigured', undefined, 'Choose a project to set up a connection.');
            return;
        }
        if (this.suspended) {
            this.present(revision, 'disconnected', target, 'Disconnected for this session. Reconnect to resume connection-owned work.');
            return;
        }
        void this.verify(revision, snapshot, configuration, target);
    }
    private async verify(revision: number, previous: Readonly<ConnectionConfiguration>, configuration: Configuration, target: string,
        proposal?: { text: string; purpose: 'choose' | 'create' }): Promise<void> {
        if (!this.present(revision, 'checking', target, 'Checking project availability.')) return;
        let checked;
        try { checked = await new ProjectConnector(previous.file).connect(configuration); }
        catch (error) {
            if (this.current(revision)) this.present(revision, 'unavailable', target, error instanceof Error ? error.message : String(error));
            return;
        }
        if (!this.current(revision)) return;
        if (checked.value?.status !== 'connected') {
            this.present(revision, 'unavailable', target, checked.problems.map(problem => problem.message).join(' ') || `Project directory ${target} is unavailable.`);
            return;
        }
        if (proposal !== undefined) {
            this.pending = { previous, target, ...proposal };
            this.feedback.saveConfiguration(previous, proposal.text);
        } else {
            const root = checked.value.context.root;
            if (this.activeWork && (this.activeWork.canonical !== root.path || this.activeWork.identity !== root.identity)) {
                this.activeWork = undefined;
                if (!this.deliverWork(revision, undefined)) return;
            }
            this.canonical = root.path;
            this.canonicalIdentity = root.identity;
            this.present(revision, 'connected', target, 'Connected.', this.canonical);
        }
    }
    private present(revision: number, status: string, target: string | undefined, message: string, verifiedDirectory?: string): boolean {
        if (!this.snapshot) return false;
        return this.publish(revision, Object.freeze({ configurationFile: this.snapshot.file, status, target, verifiedDirectory, message }));
    }
    private publish(revision: number, state: Readonly<ConnectionState>): boolean {
        if (!this.current(revision)) return false;
        if (state.status === 'connected' && state.target && state.verifiedDirectory && this.canonicalIdentity && this.snapshot) {
            this.activeWork = { configuration: this.snapshot, target: state.target,
                canonical: state.verifiedDirectory, identity: this.canonicalIdentity };
        } else if (!(state.status === 'checking' && this.activeWork && this.activeWork.configuration === this.snapshot
            && this.activeWork.target === state.target && !this.suspended)) this.activeWork = undefined;
        this.state = state;
        this.feedback.present(state);
        if (!this.current(revision)) return false;
        return this.deliverWork(revision, this.activeWork?.configuration);
    }
    private deliverWork(revision: number, configuration: ConnectionConfiguration | undefined): boolean {
        if (!this.current(revision)) return false;
        const observer = this.workObserver;
        if (!observer) return true;
        if (!observer.delivered || observer.configuration !== configuration) {
            observer.delivered = true;
            observer.configuration = configuration;
            observer.feedback.configurationChanged(configuration);
        }
        return this.current(revision) && this.workObserver === observer;
    }
    private prepareGuidance(): void {
        const snapshot = this.snapshot;
        if (!snapshot || snapshot.text !== undefined && !this.configuration) { this.guidanceFacts = undefined; return; }
        const configured = this.configuration?.outputs.map(output => Object.freeze({ id: output.id, configured: true })) ?? [];
        const ids = new Set(configured.map(output => output.id));
        const suggestions = [
            { id: 'typescript', configured: false, suggestedDirectory: '.' },
            { id: 'uml', configured: false, suggestedDirectory: 'diagrams' },
            { id: 'markdown', configured: false, suggestedDirectory: 'docs' },
        ].filter(output => !ids.has(output.id)).map(output => Object.freeze(output));
        const outputs = [...configured, ...suggestions];
        Object.freeze(outputs);
        this.guidanceFacts = Object.freeze({ configuration: snapshot, requiresEntries: snapshot.text === undefined,
            hasProject: this.configuration?.project !== undefined, outputs });
    }
    private writable(): boolean {
        if (!this.snapshot) return false;
        if (this.snapshot.text !== undefined && !this.configuration) {
            this.present(this.revision, 'invalid', undefined, this.configurationProblem);
            return false;
        }
        if (this.snapshot.writable !== true) {
            this.rejectChange('Save or revert unsaved configuration edits before changing a connection.');
            return false;
        }
        return true;
    }
    private rejectChange(message: string): void {
        if (!this.snapshot) return;
        this.publish(this.revision, Object.freeze({ ...(this.state ?? {
            configurationFile: this.snapshot.file, status: 'unconfigured', target: this.configuredTarget(),
        }), message }));
    }
    private ancestor(event: string, root: string): boolean {
        if (!isAbsolute(event)) return false;
        const path = relative(resolve(event), root);
        return path === '' || !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep);
    }
    private requireAbsolute(path: string, description: string): void {
        if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new TypeError(`Provide an absolute native ${description}.`);
    }

/**
     * Unverified implementation obligation.
     * Attach one replaceable work observer without changing this controller's constructor or requiring metadata-only callers to attach one. Immediately deliver the current active saved snapshot or absence. Replacing an observer withdraws the previous observer first; disposal withdraws and releases it. Capture observer identity and controller revision around every callback. Reentrant replacement, disconnect, configuration changes or disposal cannot subsequently deliver old active work or overwrite newer state. Host callback failures remain observable; do not swallow them or skip owned cleanup. The actual extension assembly attaches its one existing GenerationHost through this operation, rather than routing generation through preview feedback.
     */
observeWork(feedback: ConnectionWorkFeedback): void {
        if (this.disposed) { feedback.configurationChanged(undefined); return; }
        const observing = ++this.observerRevision;
        const previous = this.workObserver;
        this.workObserver = undefined;
        previous?.feedback.configurationChanged(undefined);
        if (this.disposed || this.observerRevision !== observing) return;
        this.workObserver = { feedback, delivered: false };
        this.deliverWork(this.revision, this.activeWork?.configuration);
    }

/**
     * Unverified implementation obligation.
     * Create or replace this selected manifest's project connection using an actual absolute target directory and the author's ordered output choices. Validate before requesting a conditional save; unknown or repeated IDs, unsupported new profiles, invalid relative destinations, invalid existing configuration, dirty write safety or missing required entries request no persistence. Preserve existing version, build including entries, packages, libraries and all other metadata. For each selected already configured ID retain its exact options; do not normalize, flatten or replace advanced settings. A retained choice omits directory or supplies its unchanged existing destination; a different destination requires editing the manifest. Removing an ID removes only its output configuration, never target artifacts. Newly selected profiles are limited to typescript, uml and markdown and require a nonblank destination relative to the target. Validate the complete proposal using actual shipped ConfigurationReader profiles. New TypeScript options are sourceRoot '.', directory the supplied value and no configFile, preserving folders relative to this manifest's source folder; '.' is a usable target-root destination, not an SDK default. New UML options are directory plus views ['structure']; new Markdown options contain directory. The native guide's suggested destinations are author choices, not language defaults. For missing text require an explicitly supplied nonempty list of literal relative source entries; propose formatVersion 1 and version 0.1.0 with those actual entries. Never discover sources, assume src/main.expec exists, scaffold a target, install packages or claim generation readiness. Existing metadata does not need new entries and retains its build unchanged. Verify the proposed target with the real connector; both empty and existing usable directories can connect. Invalidate older verification, pending saves and connection-owned work before accepting a new target. Request only manifest persistence through feedback with the exact captured previous snapshot, and remain checking until actual saved confirmation. A successful explicit creation resumes this session's selection. No target or authored-source writes.
     */
createConnection(directory: string, outputs: Array<ConnectionOutputChoice>, entries: Array<string>): void {
        if (this.disposed || !this.snapshot) return;
        this.requireAbsolute(directory, 'project directory');
        if (!this.writable()) return;
        if (!Array.isArray(outputs) || !Array.isArray(entries)) {
            this.rejectChange('Supply ordered output choices and literal source entries.');
            return;
        }
        if (!this.raw && entries.length === 0) {
            this.rejectChange('Choose at least one actual source entry for a new manifest.');
            return;
        }
        const retained = (this.raw?.outputs ?? []) as Array<{ id: string; options: Record<string, unknown> }>;
        const selected: Array<{ id: string; options: Record<string, unknown> }> = [];
        const ids = new Set<string>();
        for (const choice of outputs) {
            if (!choice || typeof choice.id !== 'string' || ids.has(choice.id)) {
                this.rejectChange('Output choices must have unique profile IDs.');
                return;
            }
            ids.add(choice.id);
            const existing = retained.find(output => output.id === choice.id);
            if (existing) {
                if (choice.directory !== undefined && choice.directory !== existing.options.directory) {
                    this.rejectChange('Edit the manifest to change retained output options.');
                    return;
                }
                selected.push(existing);
            } else {
                if (!['typescript', 'uml', 'markdown'].includes(choice.id)) {
                    this.rejectChange('New guided outputs support TypeScript, UML and Markdown; edit the manifest for advanced profiles.');
                    return;
                }
                if (typeof choice.directory !== 'string' || !choice.directory.trim()) {
                    this.rejectChange('Choose a relative destination for each new output.');
                    return;
                }
                const options: Record<string, unknown> = { directory: choice.directory };
                if (choice.id === 'typescript') options.sourceRoot = '.';
                if (choice.id === 'uml') options.views = ['structure'];
                selected.push({ id: choice.id, options });
            }
        }
        const previous = Object.freeze({ ...this.snapshot });
        const raw = { ...(this.raw ?? { formatVersion: 1, version: '0.1.0', build: { entries: [...entries] } }),
            project: { root: directory }, outputs: selected };
        const text = JSON.stringify(raw);
        const checked = this.reader.read({ sourceId: previous.file, text });
        if (!checked.value) {
            this.rejectChange(checked.problems.map(problem => problem.message).join(' '));
            return;
        }
        const revision = this.advance();
        if (!this.current(revision)) return;
        this.candidate = directory;
        void this.verify(revision, previous, checked.value, directory, { text, purpose: 'create' });
    }

/**
     * Unverified implementation obligation.
     * Suspend this selected connection for this session only. Invalidate verification and unsent persistence, withdraw connection-owned work before presenting disconnected with the saved logical target and no verifiedDirectory. A missing project remains unconfigured. Preserve every saved manifest byte, output/package setting and target file. Explain that reconnection is available and the suspension is not persisted. Relevant target restoration or same-manifest saved changes do not silently reconnect. Keep independent authored previews and live package configuration available; no automatic generation or rollback claim.
     */
disconnect(): void {
        if (this.disposed || !this.snapshot) return;
        const revision = this.advance();
        if (!this.current(revision)) return;
        this.suspended = true;
        this.canonical = undefined;
        this.canonicalIdentity = undefined;
        this.checkSaved(revision);
    }

/**
     * Unverified implementation obligation.
     * Resume this session's selection by freshly validating the latest captured saved metadata and checking its current target through the real connector. Withdraw old work until actual current verification succeeds. Unavailable, invalid or missing metadata stays honest and requests no save. Preserve saved configuration, previous explicit per-manifest generation opt-in and target files; previously disabled stays disabled. Reconnection neither grants opt-in nor replays a save intent: even an earlier true opt-in requires a subsequent genuine source save before any generation. Only the current reconnect revision can present or activate work.
     */
reconnect(): void {
        if (this.disposed || !this.snapshot) return;
        const revision = this.advance();
        if (!this.current(revision)) return;
        this.suspended = false;
        if (this.snapshot.text !== undefined) {
            const checked = this.reader.read({ sourceId: this.snapshot.file, text: this.snapshot.text });
            this.configuration = checked.value;
            this.configurationProblem = checked.problems.map(problem => problem.message).join(' ');
        }
        this.checkSaved(revision);
    }

/**
     * Unverified implementation obligation.
     * Remove only this selected saved manifest's project metadata through the same conditional persistence feedback. Reject invalid or dirty configuration without rewriting it, and treat an already absent project as unconfigured without a write. Preserve version, build, outputs, packages, libraries and all other fields exactly as values; never delete the manifest, target directory, generated files or handwritten files. Invalidate pending verification and withdraw connection-owned work before requesting removal. A request is not deletion success; become unconfigured only after actual saved confirmation without project. Failures use the exact pending previous snapshot and remain observable. Authored output previews still receive the saved retained output configuration.
     */
deleteConnection(): void {
        if (this.disposed || !this.snapshot || !this.writable()) return;
        if (!this.configuration?.project || !this.raw) {
            const revision = this.advance();
            if (this.current(revision)) this.present(revision, 'unconfigured', undefined, 'No project connection is configured.');
            return;
        }
        const previous = Object.freeze({ ...this.snapshot }), target = this.configuredTarget();
        const raw = { ...this.raw };
        delete raw.project;
        const text = JSON.stringify(raw);
        const revision = this.advance();
        if (!this.current(revision)) return;
        if (!this.present(revision, 'checking', target, 'Removing project connection metadata.')) return;
        this.pending = { previous, target, text, purpose: 'delete' };
        this.feedback.saveConfiguration(previous, text);
    }

/**
     * Unverified implementation obligation.
     * Return synchronous detached immutable facts prepared from the current captured saved snapshot and its already validated configuration. Missing metadata has requiresEntries true and hasProject false. Existing valid metadata keeps its build, has requiresEntries false and hasProject exactly when its validated project exists. A requested unsaved target is not saved project metadata. Invalid metadata, no captured selection or a disposed lifetime returns absence. List configured outputs first in actual authored order with configured true and no suggestedDirectory, then eligible new typescript, uml and markdown IDs not already configured with configured false and suggestions '.', 'diagrams' and 'docs'. Suggestions are core-owned extension setup policy, not SDK defaults. Do not expose or reconstruct retained options; createConnection preserves their actual saved values. Return file, exact text or absence, and writable from the same captured snapshot, including dirty write safety. Caller mutation cannot alter earlier or future facts. Prepare facts when the saved configuration changes; this query performs no parsing, validation, connector work, reads, state publication, observer notification or persistence. It does not change session suspension or generation opt-in.
     */
guidance(): ConnectionGuidance | undefined {
        return this.guidanceFacts;
    }
}

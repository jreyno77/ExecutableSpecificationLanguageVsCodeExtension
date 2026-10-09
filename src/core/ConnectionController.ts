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
     * Capture this exact saved text and write safety for one selected local manifest. Advance currentness before any asynchronous work and withdraw the old connected state while checking. Missing text is unconfigured. Validate existing text with the real ConfigurationReader and registered built-in output profiles; invalid configuration stays invalid with its real diagnostic message and is never rewritten. Use ProjectConnector.connect with this absolute manifest filename. A valid configuration without a project is unconfigured; an unavailable root is unavailable; only an actual connected result establishes connected and verifiedDirectory. Preserve logical target and canonical verified directory separately. Do not scan or capture a project, install packages, generate outputs or parse native project code. Only the latest configuration/target revision may publish.
     */
    configurationChanged(snapshot: ConnectionConfiguration): void {
        if (this.disposed) return;
        this.requireAbsolute(snapshot.file, 'configuration filename');
        const revision = this.advance();
        this.snapshot = Object.freeze({ file: snapshot.file, text: snapshot.text, writable: snapshot.writable });
        this.configuration = undefined;
        this.raw = undefined;
        this.canonical = undefined;
        this.configurationProblem = '';
        if (snapshot.text === undefined) {
            this.present(revision, 'unconfigured', undefined, 'Choose a project to set up a connection.');
            return;
        }
        const checked = this.reader.read({ sourceId: snapshot.file, text: snapshot.text });
        if (!checked.value) {
            this.configurationProblem = checked.problems.map(problem => problem.message).join(' ');
            this.present(revision, 'invalid', undefined, this.configurationProblem);
            return;
        }
        this.configuration = checked.value;
        this.raw = JSON.parse(snapshot.text) as Record<string, unknown>;
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
        if (!checked.value) {
            this.present(revision, 'invalid', directory, checked.problems.map(problem => problem.message).join(' '));
            return;
        }
        this.candidate = directory;
        void this.verify(revision, previous, checked.value, directory, text);
    }
    /**
     * Unverified implementation obligation.
     * Recheck the current configured target automatically after relevant logical or canonical root or ancestor events, including deletion and restoration. Ignore unrelated paths and events for a superseded target. Reuse validated current configuration; perform only connector identity/availability checking, not tree capture. Withdraw connected while rechecking and suppress stale completion.
     */
    targetChanged(path: string): void {
        if (this.disposed || !this.snapshot) return;
        const target = this.configuredTarget();
        if (![target, this.canonical, this.candidate].some(root => root !== undefined && this.ancestor(path, root))) return;
        this.checkSaved(this.advance());
    }
    /**
     * Unverified implementation obligation.
     * For the exact previous object of the current pending save request, report unavailable with this host failure message; never pretend the requested configuration was saved or connected. Ignore failures from superseded requests.
     */
    saveFailed(previous: ConnectionConfiguration, message: string): void {
        if (this.disposed || this.pending?.previous !== previous) return;
        const target = this.pending.target;
        this.present(this.advance(), 'unavailable', target, message);
    }
    /**
     * Unverified implementation obligation.
     * End this controller lifetime, invalidate pending asynchronous work and prevent later publication or save requests. Repeated disposal is harmless; the native caller owns watchers and view registrations.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.advance();
        this.snapshot = undefined;
        this.configuration = undefined;
        this.raw = undefined;
        this.canonical = undefined;
        this.state = undefined;
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
    private candidate: string | undefined;
    private pending: { previous: ConnectionConfiguration; target: string } | undefined;
    private configurationProblem = '';
    private revision = 0;
    private disposed = false;

    private advance(): number {
        this.pending = undefined;
        this.candidate = undefined;
        return ++this.revision;
    }
    private current(revision: number): boolean { return !this.disposed && this.revision === revision; }
    private configuredTarget(): string | undefined {
        return this.snapshot && this.configuration?.project
            ? resolve(dirname(this.snapshot.file), this.configuration.project.root) : undefined;
    }
    private checkSaved(revision: number): void {
        const snapshot = this.snapshot;
        const configuration = this.configuration;
        const target = this.configuredTarget();
        if (!snapshot || !configuration || !target) {
            this.present(revision, 'unconfigured', undefined, 'Choose a project to set up a connection.');
            return;
        }
        void this.verify(revision, snapshot, configuration, target);
    }
    private async verify(revision: number, previous: Readonly<ConnectionConfiguration>, configuration: Configuration, target: string, proposedText?: string): Promise<void> {
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
        if (proposedText !== undefined) {
            this.pending = { previous, target };
            this.feedback.saveConfiguration(previous, proposedText);
        } else {
            this.canonical = checked.value.context.root.path;
            this.present(revision, 'connected', target, 'Connected.', this.canonical);
        }
    }
    private present(revision: number, status: string, target: string | undefined, message: string, verifiedDirectory?: string): boolean {
        if (!this.snapshot) return false;
        return this.publish(revision, Object.freeze({ configurationFile: this.snapshot.file, status, target, verifiedDirectory, message }));
    }
    private publish(revision: number, state: Readonly<ConnectionState>): boolean {
        if (!this.current(revision)) return false;
        this.state = state;
        this.feedback.present(state);
        return this.current(revision);
    }
    private ancestor(event: string, root: string): boolean {
        if (!isAbsolute(event)) return false;
        const path = relative(resolve(event), root);
        return path === '' || !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep);
    }
    private requireAbsolute(path: string, description: string): void {
        if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new TypeError(`Provide an absolute native ${description}.`);
    }
}

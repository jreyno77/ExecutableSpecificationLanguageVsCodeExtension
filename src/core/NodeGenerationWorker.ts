import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, isAbsolute } from 'node:path';
import type { GenerationResult } from './GenerationResult.js';
import { compatibleNode, errorText, object, writeProblems, type HostMessage } from './generation-worker-protocol.js';
import type { GenerationRequest } from "./GenerationRequest.js";
import type { GenerationRunFeedback } from "./GenerationRunFeedback.js";
import type { GenerationShutdownFeedback } from "./GenerationShutdownFeedback.js";



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vitest (test)
 */
export class NodeGenerationWorker {
    private readonly nodeExecutable: string;
    private readonly entry: string;
    private running?: OwnedRun;
    private disposed = false;
    private readonly completions: GenerationShutdownFeedback[] = [];
    private readonly cleanupErrors: string[] = [];
    constructor(nodeExecutable: string, entry: string) {
        if (!nodeExecutable.trim()) throw Error('An explicit Node executable is required.');
        if (!isAbsolute(entry)) throw Error('The packaged generation entry must be absolute.');
        this.nodeExecutable = nodeExecutable;
        this.entry = entry;
    }
    /**
     * Unverified implementation obligation.
     * Spawn the supplied packaged entry without a shell using this explicit Node executable or workspace PATH node. Never substitute Electron process.execPath or download a runtime. Admit the actual child version only when compatible with the pinned SDK's declared Node range; retain actual launch/version errors. Verify readiness per child lifetime. The entry imports the shipped pinned SDK with its original module-relative asset roots and calls public runCli with build --config the exact absolute saved manifest --json and PROJECT-42 CliHost signal/stdout/stderr/asynchronous checkWrite. Forward actual root checks over owned plain IPC and map refusals to actual located Diagnostic values. Carry the actual child runtimeVersion separately from unchanged SDK JSON, including rejected versions. The SDK owns full entries, target order, preservation, journal recovery and native/disk guards. No CLI copy, temporary manifest, selected-entry Compilation, init or install.
     */
    start(request: GenerationRequest, feedback: GenerationRunFeedback): void {
        if (this.disposed) throw Error('Generation worker is disposed.');
        if (this.running) throw Error('Generation worker already owns an active build.');
        const manifest = request.configuration.file;
        if (!isAbsolute(manifest)) throw Error('The saved generation manifest must be absolute.');
        const child = spawn(this.nodeExecutable, [this.entry], {
            cwd: dirname(manifest), shell: false, windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        const run: OwnedRun = { child, manifest, feedback, pending: new Set(), checks: new Set(),
            errors: [], stderr: '', ready: false, closed: false, finalizing: false,
            cancelSent: false, forced: false, cleanupUnconfirmed: false, stderrTruncated: false };
        this.running = run;
        // These pipes are diagnostic evidence; only the entry's SDK sink is a CLI report.
        child.stdout?.on('data', () => {});
        child.stderr?.on('data', value => {
            const text = String(value);
            const remaining = stderrEvidenceLimit - run.stderr.length;
            run.stderr += text.slice(0, Math.max(0, remaining));
            if (text.length > remaining && !run.stderrTruncated) {
                run.stderrTruncated = true;
                this.forceClose(run, 'Generation stderr evidence exceeded 65536 characters; retained prefix is truncated.');
            }
        });
        child.on('message', value => this.received(run, value));
        child.on('error', error => { run.errors.push(errorText(error)); if (child.pid) this.forceClose(run, 'Owned child process failed.'); });
        child.on('disconnect', () => {
            if (!run.closed && !run.result) this.forceClose(run, 'Generation IPC disconnected before its terminal result.');
        });
        child.on('close', (code, signal) => {
            run.closed = true;
            if (run.cleanupTimer) clearTimeout(run.cleanupTimer);
            if (run.closureTimer) clearTimeout(run.closureTimer);
            run.exitCode = code ?? undefined;
            if (signal) run.errors.push('Owned generation child closed with signal ' + signal + '.');
            void this.complete(run);
        });
    }
    /**
     * Unverified implementation obligation.
     * Send cooperative cancellation over owned child IPC to its CliHost AbortController. Never treat Windows child.kill(SIGINT) as graceful cancellation. Observe pending permission replies and process failure; do not allow a later reply to initiate application. Keep actual partial/uncertain receipts, not a rollback claim.
     */
    cancel(): void {
        const run = this.running;
        if (!run || run.closed || run.result || run.cancelSent) return;
        run.cancelSent = true;
        this.send(run, { type: 'cancel' });
    }
    /**
     * Unverified implementation obligation.
     * Stop accepting work, request cancellation once and drain owned callbacks, IPC and child process before notifying completion. Attempt remaining cleanup after failure and preserve every actual cause. If force cleanup is necessary, explicitly record uncertain effects and cleanup failure. Repeated callers join this one shutdown.
     */
    dispose(completion: GenerationShutdownFeedback): void {
        this.disposed = true;
        this.completions.push(completion);
        this.cancel();
        if (!this.running) this.stopped();
    }

    private received(run: OwnedRun, value: unknown): void {
        if (run.closed || run.finalizing) return;
        if (!object(value)) { this.forceClose(run, 'Invalid generation IPC message.'); return; }
        if (value.type === 'ready' && typeof value.runtimeVersion === 'string' && !run.ready) {
            run.ready = true;
            run.runtimeVersion = value.runtimeVersion;
            if (!compatibleNode(value.runtimeVersion)) {
                this.forceClose(run, 'Incompatible Node runtime ' + value.runtimeVersion + '; expected >=24.19.0 <25.');
                return;
            }
            // An early cancellation still reaches the public SDK with its aborted host.
            this.send(run, { type: 'start', manifest: run.manifest });
            return;
        }
        if (value.type === 'check' && run.ready && !run.result && Number.isSafeInteger(value.id)
            && Number(value.id) > 0 && typeof value.root === 'string' && isAbsolute(value.root)) {
            const id = Number(value.id);
            if (run.checks.has(id)) { this.forceClose(run, 'Duplicate generation permission request.'); return; }
            run.checks.add(id);
            try {
                const problems = writeProblems(run.feedback.writeProblems(value.root));
                this.send(run, { type: 'permission', id, problems });
            } catch (error) {
                this.send(run, { type: 'permission', id, problems: [], error: errorText(error) });
            }
            return;
        }
        if (value.type === 'result' && run.ready && !run.result && typeof value.report === 'string'
            && (value.exitCode === undefined || (Number.isInteger(value.exitCode) && Number(value.exitCode) >= 0))
            && (value.error === undefined || typeof value.error === 'string')) {
            run.result = { report: value.report, exitCode: value.exitCode as number | undefined, error: value.error as string | undefined };
            return;
        }
        this.forceClose(run, 'Invalid or out-of-order generation IPC message.');
    }

    private send(run: OwnedRun, message: HostMessage): void {
        const pending = new Promise<void>((done, reject) => {
            if (!run.child.connected) { reject(Error('Generation IPC is not connected.')); return; }
            try { run.child.send(message, error => error ? reject(error) : done()); }
            catch (error) { reject(error); }
        }).catch(error => { this.forceClose(run, 'Generation IPC send failed: ' + errorText(error)); });
        run.pending.add(pending);
        void pending.then(() => run.pending.delete(pending));
    }

    private forceClose(run: OwnedRun, reason: string): void {
        run.errors.push(reason);
        if (!run.child.pid || run.cleanupUnconfirmed) return;
        run.cleanupUnconfirmed = true;
        run.errors.push('Native descendant state is unconfirmed; earlier generation effects may be partial or uncertain.');
        if (run.closed) return;
        // Failure only: let the entry's AbortController/SDK cleanup finish its own grace first.
        run.cleanupTimer = setTimeout(() => {
            if (run.closed) return;
            run.forced = true;
            run.errors.push('Forced owned Node child cleanup after failed IPC; native descendant state remains unconfirmed.');
            try {
                if (!run.child.kill('SIGKILL')) run.errors.push('Owned child force cleanup was not accepted.');
            } catch (error) { run.errors.push('Owned child cleanup failed: ' + errorText(error)); }
            // A missing CLOSE is itself cleanup failure, not proof of termination.
            run.closureTimer = setTimeout(() => {
                if (run.closed) return;
                run.errors.push('Owned child CLOSE was not observed after forced cleanup; process state and effects are uncertain.');
                run.child.stdout?.destroy();
                run.child.stderr?.destroy();
                try { if (run.child.connected) run.child.disconnect(); }
                catch (error) { run.errors.push('Owned IPC cleanup failed: ' + errorText(error)); }
                run.child.unref();
                void this.complete(run);
            }, failureCleanupGrace);
        }, failureCleanupGrace);
        if (run.child.connected && !run.cancelSent) {
            run.cancelSent = true;
            this.send(run, { type: 'cancel' });
        }
    }

    private async complete(run: OwnedRun): Promise<void> {
        if (run.finalizing) return;
        run.finalizing = true;
        while (run.pending.size) await Promise.allSettled([...run.pending]);
        if (!run.result) run.errors.push(run.closed ? 'Owned generation child closed without an SDK terminal result.' : 'Owned generation child has no SDK terminal result; CLOSE remains unconfirmed.');
        if (run.result?.error) run.errors.push(run.result.error);
        if (run.result?.exitCode !== undefined && run.exitCode !== undefined && run.result.exitCode !== run.exitCode)
            run.errors.push('Reported CLI exit ' + run.result.exitCode + ' differs from actual child exit ' + run.exitCode + '.');
        const failed = run.errors.length > 0 || run.result?.exitCode !== 0 || run.exitCode !== 0;
        if (failed && run.stderr.trim()) run.errors.push(run.stderr.trim());
        const error = run.errors.length ? run.errors.join('\n') : undefined;
        if (run.cleanupUnconfirmed) this.cleanupErrors.push(error ?? 'Forced cleanup left uncertain effects.');
        const result: GenerationResult = { runtimeVersion: run.runtimeVersion, exitCode: run.exitCode,
            report: run.result?.report ?? '', ...(error ? { error } : {}) };
        this.running = undefined;
        try { run.feedback.finished(result); }
        catch (cause) { this.cleanupErrors.push('Generation result callback failed: ' + errorText(cause)); }
        if (this.disposed && !this.running) this.stopped();
    }

    private stopped(): void {
        const error = this.cleanupErrors.length ? this.cleanupErrors.join('\n') : undefined;
        const failures: string[] = [];
        for (const completion of this.completions.splice(0)) {
            try { completion.stopped(error); }
            catch (cause) { failures.push('Generation shutdown callback failed: ' + errorText(cause)); }
        }
        this.cleanupErrors.push(...failures);
    }
}

interface OwnedRun {
    child: ChildProcess;
    manifest: string;
    feedback: GenerationRunFeedback;
    pending: Set<Promise<void>>;
    checks: Set<number>;
    errors: string[];
    stderr: string;
    ready: boolean;
    closed: boolean;
    finalizing: boolean;
    cleanupUnconfirmed: boolean;
    stderrTruncated: boolean;
    cleanupTimer?: ReturnType<typeof setTimeout>;
    closureTimer?: ReturnType<typeof setTimeout>;
    cancelSent: boolean;
    forced: boolean;
    runtimeVersion?: string;
    result?: GenerationResult;
    exitCode?: number;
}
const stderrEvidenceLimit = 65536;
const failureCleanupGrace = 5000;

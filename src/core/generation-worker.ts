import { isAbsolute } from 'node:path';
import type { Diagnostic } from 'executable-specification-language';
import { compatibleNode, errorText, object, writeProblems, type WorkerMessage } from './generation-worker-protocol.js';

const cancellation = new AbortController();
const permissions = new Map<number, { done(problems: Diagnostic[]): void; reject(error: Error): void }>();
const sends = new Set<Promise<void>>();
let nextPermission = 0;
let started = false;
let report = '';
let stderr = '';
let stderrTruncated = false;
let parentLost = false;

function send(message: WorkerMessage): Promise<void> {
    const pending = new Promise<void>((done, reject) => {
        if (!process.connected || !process.send) { reject(Error('Generation parent IPC is disconnected.')); return; }
        try { process.send(message, error => error ? reject(error) : done()); }
        catch (error) { reject(error); }
    });
    sends.add(pending);
    void pending.then(() => sends.delete(pending), () => sends.delete(pending));
    return pending;
}
function abort(reason: Error): void {
    cancellation.abort(reason);
    for (const permission of permissions.values()) permission.reject(reason);
    permissions.clear();
}
async function checkWrite(root: string): Promise<Diagnostic[]> {
    if (cancellation.signal.aborted) throw cancellation.signal.reason;
    const id = ++nextPermission;
    const answer = new Promise<Diagnostic[]>((done, reject) => permissions.set(id, { done, reject }));
    // Attach observation before awaiting IPC so an intervening cancellation is never unhandled.
    void answer.catch(() => {});
    try { await send({ type: 'check', id, root }); }
    catch (error) {
        permissions.delete(id);
        abort(Error('Generation permission IPC failed: ' + errorText(error)));
        throw error;
    }
    return answer;
}
async function finish(exitCode: number | undefined, error?: string): Promise<void> {
    while (sends.size) await Promise.allSettled([...sends]);
    try { await send({ type: 'result', report, exitCode, ...(error ? { error } : {}) }); }
    catch (cause) { process.stderr.write('Generation terminal IPC failed: ' + errorText(cause) + '\n'); }
    process.exitCode = exitCode ?? 1;
    if (process.connected) process.disconnect();
}
async function build(manifest: string): Promise<void> {
    let exitCode: number | undefined;
    let failure: string | undefined;
    try {
        // Preserve the pristine SDK's module-relative native/runtime resource closure.
        const { runCli } = await import('executable-specification-language');
        exitCode = await runCli(['build', '--config', manifest, '--json'], {}, {
            signal: cancellation.signal,
            stdout(text) { report += text; },
            stderr(text) {
                const remaining = 65536 - stderr.length;
                stderr += text.slice(0, Math.max(0, remaining));
                if (text.length > remaining) {
                    stderrTruncated = true;
                    throw Error('SDK stderr evidence exceeded 65536 characters; retained prefix is truncated.');
                }
            },
            checkWrite(root) { return checkWrite(root.path); },
        });
    } catch (error) { failure = errorText(error); }
    if (stderrTruncated) failure = [failure, 'SDK stderr evidence exceeded 65536 characters; retained prefix is truncated and earlier effects may be partial or uncertain.'].filter(Boolean).join('\n');
    if ((failure || exitCode !== 0) && stderr.trim()) failure = [failure, stderr.trim()].filter(Boolean).join('\n');
    if (parentLost) failure = [failure, 'Generation parent IPC was lost; effects may be partial or uncertain.'].filter(Boolean).join('\n');
    await finish(exitCode, failure);
}
process.on('disconnect', () => {
    parentLost = true;
    abort(Error('Generation parent IPC disconnected.'));
});
process.on('message', value => {
    if (!object(value)) { abort(Error('Invalid generation parent message.')); return; }
    if (value.type === 'cancel') { abort(Error('Generation cancelled by its owner.')); return; }
    if (value.type === 'permission' && Number.isSafeInteger(value.id)) {
        const id = Number(value.id);
        const permission = permissions.get(id);
        if (!permission) return; // Cancellation owns late replies; they cannot apply anything.
        permissions.delete(id);
        try {
            if (value.error !== undefined) {
                if (typeof value.error !== 'string') throw Error('Invalid generation permission error.');
                throw Error(value.error);
            }
            const problems = writeProblems(value.problems);
            permission.done(problems.map(problem => ({ code: problem.code, message: problem.message,
                at: { kind: 'dependency', path: ['editor', problem.path] }, related: [] })));
        } catch (error) { permission.reject(Error(errorText(error))); }
        return;
    }
    if (value.type === 'start' && !started && typeof value.manifest === 'string' && isAbsolute(value.manifest)) {
        started = true;
        if (!compatibleNode(process.versions.node)) {
            void finish(undefined, 'Incompatible Node runtime ' + process.versions.node + '; expected >=24.19.0 <25.');
            return;
        }
        void build(value.manifest);
        return;
    }
    abort(Error('Invalid or overlapping generation start request.'));
});
void send({ type: 'ready', runtimeVersion: process.versions.node }).catch(error => {
    process.stderr.write(errorText(error) + '\n');
    process.exitCode = 1;
    if (process.connected) process.disconnect();
});
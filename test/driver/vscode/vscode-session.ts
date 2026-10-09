import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { NativeCleanupError, NativeLauncher, ownTemporaryDirectory, removeOwnedDirectory, within } from './native-process.js';

type DocumentObservation = { file: string; text: string; languageId: string };
type DiagnosticPosition = { readonly line: number; readonly character: number };
type DiagnosticRange = { readonly start: DiagnosticPosition; readonly end: DiagnosticPosition };
export type DiagnosticObservation = {
  readonly uri: string; readonly text: string; readonly version: number; readonly initialVersion: number; readonly resultId: string; readonly dirty: boolean;
  readonly savedText: string | null; readonly previousProblemCount: number; readonly closed: boolean;
  readonly diagnostics: readonly {
    readonly message: string; readonly severity: number; readonly range: DiagnosticRange;
    readonly code?: string | number; readonly source?: string;
    readonly relatedInformation?: readonly { readonly message: string; readonly location: { readonly uri: string; readonly range: DiagnosticRange } }[];
  }[];
};
export type DiagnosticMiddlewareObservation = { cancellationError: boolean; nextCalls: number; runtime: { node: string; vscode: string } };

export type SidebarObservation = { readonly status: string; readonly project: string; readonly explanation: string; readonly saved?: string; readonly unsaved?: string };
export type PreviewEditorObservation = { readonly uri: string; readonly version: number; readonly text: string; readonly dirty: boolean; readonly savedText: string };

export type GenerationEditorObservation = {
  uri: string; version: number; text: string; dirty: boolean; savedText: string; configurationFile: string;
  dirtyBuffers: { uri: string; text: string; version: number; dirty: boolean }[];
  outputDocuments: { uri: string; text: string }[];
};
export type GenerationEditorSetup = { file: string; other: string; directory: string; workspace: string; configurationFile: string;
  resetFile: string; nodeExecutable: string; enabled: boolean };

type Operation = 'generationOpen' | 'generationAction' | 'generationObserve' | 'generationDispose' | 'previewOpen' | 'previewShow' | 'previewEdit' | 'previewSaveConfiguration' | 'previewObserve' | 'previewClosePanel' | 'previewDispose' | 'sidebarOpen' | 'sidebarObserve' | 'sidebarAction' | 'sidebarDispose' | 'missingDocumentDiagnostics' | 'readDocument' | 'extensionPath' | 'shutdown' | 'diagnosticOpen' | 'diagnosticEdit' | 'diagnosticObserve' | 'diagnosticClose' | 'diagnosticDispose' | 'diagnosticDependency';
type Pending = { promise: Promise<unknown>; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

/** One owned native host, with only the observations needed by its test consumers. */
export class VsCodeSession {
  private readonly token = randomBytes(32).toString('hex');
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private socket: Socket | undefined;
  private launcher: NativeLauncher | undefined;
  private launching: Promise<NativeLauncher> | undefined;
  private readonly starting = new AbortController();
  private readonly pending = new Map<string, Pending>();
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private failure: Error | undefined;
  private closing = false;
  private cleanup: Promise<void> | undefined;
  private disposal: Promise<void> | undefined;
  private browser: Promise<Browser> | undefined;

  private constructor(private readonly directory: string) {
    this.ready = new Promise((resolveReady, reject) => { this.readyResolve = resolveReady; this.readyReject = reject; });
    void this.ready.catch(() => undefined);
    this.server = createServer(socket => this.accept(socket));
    this.server.on('error', error => { void this.poison(error).catch(() => undefined); });
  }

  static async start(executable: string, extensionsDirectory: string, workspaceDirectory: string): Promise<VsCodeSession> {
    const session = new VsCodeSession(await ownTemporaryDirectory('expec-vscode-session-'));
    try {
      await within((async () => {
        await new Promise<void>((resolveReady, reject) => {
          session.server.once('error', reject);
          session.server.listen({ port: 0, host: '127.0.0.1', signal: session.starting.signal }, () => { session.server.off('error', reject); resolveReady(); });
        });
        if (session.failure) throw session.failure;
        const address = session.server.address();
        if (!address || typeof address === 'string') throw new Error('The owned VS Code session has no loopback port.');
        session.launching = NativeLauncher.start(session.directory, {
          command: 'session', executable, extensionsDirectory, workspaceDirectory,
          userDataDirectory: join(session.directory, 'profile'), port: address.port, token: session.token,
        }, session.starting.signal);
        session.launcher = await session.launching;
        if (session.failure) { await session.launcher.stop(); throw session.failure; }
        void session.launcher.closed.then(() => {
          if (!session.closing) void session.poison(new Error('The native VS Code host exited unexpectedly.')).catch(() => undefined);
        }, error => { if (!session.closing) void session.poison(error).catch(() => undefined); });
        await session.ready;
      })(), 60_000, 'The owned VS Code host did not authenticate before its startup deadline.');
      return session;
    } catch (error) {
      await session.poison(error as Error);
      throw error;
    }
  }
  async readDocument(file: string): Promise<DocumentObservation> {
    const value = await this.request('readDocument', { file });
    if (!value || typeof value !== 'object' || !('file' in value) || typeof value.file !== 'string'
      || !('text' in value) || typeof value.text !== 'string' || !('languageId' in value) || typeof value.languageId !== 'string') {
      const error = new Error('The native host returned an invalid document observation.');
      await this.poison(error);
      throw error;
    }
    return value as DocumentObservation;
  }

  webviewBrowser(): Promise<Browser> {
    return this.browser ??= (async () => {
      const portFile = join(this.directory, 'profile', 'DevToolsActivePort');
      const info = await lstat(portFile);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('The owned DevTools endpoint must be an ordinary profile file.');
      const [port, path] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !path?.startsWith('/devtools/browser/')) {
        throw new Error('The owned VS Code profile has no valid DevTools endpoint.');
      }
      const endpoint = `ws://127.0.0.1:${port}${path}`;
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5_000) });
      const actual = await response.json() as { webSocketDebuggerUrl?: string };
      if (!response.ok || actual.webSocketDebuggerUrl !== endpoint) throw new Error('DevTools does not match the endpoint recorded by the owned profile.');
      const { chromium } = await import('playwright');
      const browser = await chromium.connectOverCDP(endpoint, { timeout: 5_000 });
      if (this.closing) { await browser.close(); throw new Error('The owned VS Code session is closed.'); }
      return browser;
    })().catch(async error => {
      const profile = join(this.directory, 'profile');
      let profileEntries: unknown;
      try { profileEntries = (await readdir(profile, { withFileTypes: true })).slice(0, 24).map(entry => ({
        name: entry.name.slice(0, 120), kind: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      })); } catch (inspectionError) { profileEntries = String(inspectionError).slice(0, 512); }
      throw new Error('Owned DevTools endpoint acquisition failed: ' + String(error).slice(0, 512) + '\n' + JSON.stringify({
        profile, profileEntries, launcher: this.launcher?.diagnostics(),
      }), { cause: error });
    });
  }

  openGenerationEditor(generationId: string, extensionId: string, setup: GenerationEditorSetup): Promise<GenerationEditorObservation> {
    return this.generationRequest('generationOpen', { generationId, extensionId, ...setup });
  }
  changeGenerationEditor(generationId: string, kind: string, values: Record<string, unknown> = {}): Promise<GenerationEditorObservation> {
    return this.generationRequest('generationAction', { generationId, kind, ...values });
  }
  observeGenerationEditor(generationId: string): Promise<GenerationEditorObservation> {
    return this.generationRequest('generationObserve', { generationId });
  }
  async disposeGenerationEditor(generationId: string): Promise<void> {
    const value = await this.request('generationDispose', { generationId });
    if (value !== null) throw new Error('The native generation disposal returned an invalid receipt.');
  }
  private async generationRequest(operation: Operation, values: Record<string, unknown>): Promise<GenerationEditorObservation> {
    const value = await this.request(operation, values);
    if (!value || typeof value !== 'object') throw new Error('The native generation observation is absent.');
    const actual = value as Partial<GenerationEditorObservation>;
    if (typeof actual.uri !== 'string' || !Number.isInteger(actual.version) || typeof actual.text !== 'string'
      || typeof actual.dirty !== 'boolean' || typeof actual.savedText !== 'string' || typeof actual.configurationFile !== 'string'
      || !Array.isArray(actual.dirtyBuffers) || !actual.dirtyBuffers.every(buffer => buffer && typeof buffer.uri === 'string'
        && typeof buffer.text === 'string' && Number.isInteger(buffer.version) && typeof buffer.dirty === 'boolean')
      || !Array.isArray(actual.outputDocuments) || !actual.outputDocuments.every(document => document
        && typeof document.uri === 'string' && typeof document.text === 'string')) throw new Error('The native generation observation is malformed.');
    return actual as GenerationEditorObservation;
  }

  openPreviewEditor(previewId: string, extensionId: string, setup: { file: string; configurationFile: string; resetFile: string }): Promise<PreviewEditorObservation> {
    return this.previewRequest('previewOpen', { previewId, extensionId, ...setup });
  }
  showPreviewEditor(previewId: string): Promise<PreviewEditorObservation> { return this.previewRequest('previewShow', { previewId }); }
  editPreviewEditor(previewId: string, text: string): Promise<PreviewEditorObservation> { return this.previewRequest('previewEdit', { previewId, text }); }
  savePreviewConfiguration(previewId: string, text: string): Promise<PreviewEditorObservation> { return this.previewRequest('previewSaveConfiguration', { previewId, text }); }
  observePreviewEditor(previewId: string): Promise<PreviewEditorObservation> { return this.previewRequest('previewObserve', { previewId }); }
  closePreviewPanel(previewId: string): Promise<PreviewEditorObservation> { return this.previewRequest('previewClosePanel', { previewId }); }
  async disposePreviewEditor(previewId: string): Promise<void> {
    const value = await this.request('previewDispose', { previewId });
    if (value !== null) throw new Error('The native preview disposal returned an invalid receipt.');
  }
  private async previewRequest(operation: Operation, values: Record<string, unknown>): Promise<PreviewEditorObservation> {
    const value = await this.request(operation, values);
    if (!value || typeof value !== 'object' || !('uri' in value) || typeof value.uri !== 'string' || !('version' in value) || !Number.isInteger(value.version)
      || !('text' in value) || typeof value.text !== 'string' || !('dirty' in value) || typeof value.dirty !== 'boolean'
      || !('savedText' in value) || typeof value.savedText !== 'string') throw new Error('The native host returned an invalid preview editor observation.');
    return value as PreviewEditorObservation;
  }

  async extensionPath(id: string): Promise<string | null> {
    const value = await this.request('extensionPath', { extensionId: id });
    if (value !== null && typeof value !== 'string') {
      const error = new Error('The native host returned an invalid extension path.');
      await this.poison(error);
      throw error;
    }
    return value;
  }

  async missingDocumentDiagnostics(extensionId: string): Promise<DiagnosticMiddlewareObservation> {
    const value = await this.request('missingDocumentDiagnostics', { extensionId });
    if (!value || typeof value !== 'object' || !('cancellationError' in value) || typeof value.cancellationError !== 'boolean'
      || !('nextCalls' in value) || !Number.isInteger(value.nextCalls) || (value.nextCalls as number) < 0
      || !('runtime' in value) || !value.runtime || typeof value.runtime !== 'object'
      || !('node' in value.runtime) || typeof value.runtime.node !== 'string' || !('vscode' in value.runtime) || typeof value.runtime.vscode !== 'string') {
      const error = new Error('The native host returned an invalid middleware observation.');
      await this.poison(error); throw error;
    }
    return value as DiagnosticMiddlewareObservation;
  }

  openDiagnosticDocument(documentId: string, extensionId: string, source: { text: string; file?: string; untitled: boolean; dependencyFile?: string }): Promise<DiagnosticObservation> {
    return this.diagnosticRequest('diagnosticOpen', { documentId, extensionId, ...source });
  }
  editDiagnosticDocument(documentId: string, texts: readonly string[]): Promise<DiagnosticObservation> {
    return this.diagnosticRequest('diagnosticEdit', { documentId, texts });
  }
  changeDiagnosticDependency(documentId: string, text: string | null): Promise<DiagnosticObservation> {
    return this.diagnosticRequest('diagnosticDependency', { documentId, text });
  }
  observeDiagnosticDocument(documentId: string): Promise<DiagnosticObservation> {
    return this.diagnosticRequest('diagnosticObserve', { documentId });
  }
  closeDiagnosticDocument(documentId: string): Promise<DiagnosticObservation> {
    return this.diagnosticRequest('diagnosticClose', { documentId });
  }
  async disposeDiagnosticDocument(documentId: string): Promise<void> {
    const value = await this.request('diagnosticDispose', { documentId });
    if (value !== null) throw new Error('The native document disposal returned an invalid receipt.');
  }
  private async diagnosticRequest(operation: Operation, values: Record<string, unknown>): Promise<DiagnosticObservation> {
    const value = await this.request(operation, values);
    if (!isDiagnosticObservation(value)) {
      const error = new Error('The native host returned an invalid diagnostic observation.');
      await this.poison(error); throw error;
    }
    return value;
  }

  openConnectionSidebar(sidebarId: string, extensionId: string, setup: { file: string; directory: string; resetFile: string }): Promise<SidebarObservation> {
    return this.sidebarRequest('sidebarOpen', { sidebarId, extensionId, ...setup });
  }
  observeConnectionSidebar(sidebarId: string): Promise<SidebarObservation> { return this.sidebarRequest('sidebarObserve', { sidebarId }); }
  changeConnectionSidebar(sidebarId: string, kind: 'choose' | 'save' | 'remove' | 'restore' | 'edit', name?: string, text?: string): Promise<SidebarObservation> {
    return this.sidebarRequest('sidebarAction', { sidebarId, kind, name, text });
  }
  async disposeConnectionSidebar(sidebarId: string): Promise<void> {
    const value = await this.request('sidebarDispose', { sidebarId });
    if (value !== null) throw new Error('The native sidebar disposal returned an invalid receipt.');
  }
  private async sidebarRequest(operation: Operation, values: Record<string, unknown>): Promise<SidebarObservation> {
    const value = await this.request(operation, values);
    if (!value || typeof value !== 'object' || !('status' in value) || typeof value.status !== 'string'
      || !('project' in value) || typeof value.project !== 'string' || !('explanation' in value) || typeof value.explanation !== 'string'
      || ('saved' in value && typeof value.saved !== 'string') || ('unsaved' in value && typeof value.unsaved !== 'string')) {
      const error = new Error('The native host returned an invalid sidebar observation.');
      await this.poison(error); throw error;
    }
    return value as SidebarObservation;
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.setEncoding('utf8');
    socket.setTimeout(5_000, () => socket.destroy());
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) { socket.destroy(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { socket.destroy(); return; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { socket.destroy(); return; }
        const frame = parsed as { kind?: unknown; token?: unknown; id?: unknown; value?: unknown; error?: unknown };
        if (typeof frame.kind !== 'string' || frame.token !== this.token) { socket.destroy(); return; }
        if (!this.socket) {
          if (frame.kind !== 'ready' || this.failure || this.closing) { socket.destroy(); return; }
          this.socket = socket; socket.setTimeout(0); this.readyResolve();
        } else if (this.socket !== socket) { socket.destroy(); return; }
        else {
          const pending = typeof frame.id === 'string' && this.pending.get(frame.id);
          if (frame.kind !== 'response' || !pending || ('error' in frame && typeof frame.error !== 'string')) {
            void this.poison(new Error('Unexpected native response identity.')).catch(() => undefined); return;
          }
          clearTimeout(pending.timer); this.pending.delete(frame.id as string);
          if (typeof frame.error === 'string') pending.reject(new Error(frame.error));
          else pending.resolve(frame.value);
        }
      }
    });
    socket.on('error', error => { if (this.socket === socket && !this.closing) void this.poison(error).catch(() => undefined); });
    socket.on('close', () => {
      this.sockets.delete(socket);
      if (this.socket === socket && !this.closing) void this.poison(new Error('The native VS Code session disconnected.')).catch(() => undefined);
    });
  }

  private request(operation: Operation, values: Record<string, unknown>, milliseconds = 60_000): Promise<unknown> {
    if (this.failure || (this.closing && operation !== 'shutdown') || !this.socket?.writable) {
      return Promise.reject(this.failure ?? new Error('The native VS Code session is closed.'));
    }
    const id = randomUUID();
    let resolveResult!: (value: unknown) => void;
    let rejectResult!: (error: Error) => void;
    const promise = new Promise<unknown>((resolveValue, reject) => { resolveResult = resolveValue; rejectResult = reject; });
    const timer = setTimeout(() => {
      void this.poison(new Error(`Native ${operation} exceeded its deadline, including queue time.`)).catch(() => undefined);
    }, milliseconds);
    this.pending.set(id, { promise, resolve: resolveResult, reject: rejectResult, timer });
    this.socket.write(JSON.stringify({ token: this.token, id, operation, ...values }) + '\n', error => {
      if (error) void this.poison(error).catch(() => undefined);
    });
    return promise.catch(async error => {
      await this.cleanup;
      throw error;
    });
  }

  private poison(error: Error): Promise<void> {
    if (this.cleanup) return this.cleanup;
    this.failure = error; this.closing = true; this.starting.abort(error); this.readyReject(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    return this.cleanup = (async () => {
      let confirmed = false;
      try {
        const launcher = this.launcher ?? await within(
          this.launching?.catch(() => undefined) ?? Promise.resolve(undefined), 2_000, 'Owned launcher startup did not settle after cancellation.',
        );
        await launcher?.stop(); confirmed = true;
      }
      catch (cleanupError) {
        throw cleanupError instanceof NativeCleanupError ? cleanupError
          : new NativeCleanupError(`Native ownership is unconfirmed; retained ${this.directory}.`, { cause: cleanupError });
      } finally {
        try { await this.closeNetwork(); }
        catch (cleanupError) { throw new NativeCleanupError(`Native network cleanup is unconfirmed; retained ${this.directory}.`, { cause: cleanupError }); }
        if (confirmed) await removeOwnedDirectory(this.directory);
      }
    })();
  }

  dispose(): Promise<void> { return this.disposal ??= this.finishDisposal(); }
  private async finishDisposal(): Promise<void> {
    this.closing = true;
    try {
      if (this.cleanup) { await this.cleanup; throw this.failure; }
      await within(Promise.allSettled([...this.pending.values()].map(value => value.promise)), 60_000, 'Native requests did not settle before shutdown.');
      if (this.cleanup) { await this.cleanup; throw this.failure; }
      await this.request('shutdown', {}, 5_000);
      await this.launcher!.wait(5_000);
    } catch (error) {
      await this.poison(error as Error);
      throw error;
    }
    await this.closeNetwork();
    await removeOwnedDirectory(this.directory);
  }

  private async closeNetwork(): Promise<void> {
    const errors: unknown[] = [];
    try { await (await this.browser?.catch(() => undefined))?.close(); } catch (error) { errors.push(error); }
    for (const socket of this.sockets) { try { socket.destroy(); } catch (error) { errors.push(error); } }
    if (this.server.listening) {
      try { await within(new Promise<void>((resolveClose, reject) => {
        this.server.close(error => error ? reject(error) : resolveClose());
      }), 2_000, 'The owned loopback server did not close.'); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Owned native browser/transport cleanup failed.', { cause: errors[0] });
  }
}
function isDiagnosticObservation(value: unknown): value is DiagnosticObservation {
  if (!value || typeof value !== 'object') return false;
  const packet = value as Partial<DiagnosticObservation>;
  return typeof packet.uri === 'string' && typeof packet.text === 'string' && Number.isInteger(packet.version)
    && Number.isInteger(packet.initialVersion) && typeof packet.resultId === 'string' && packet.resultId !== ''
    && typeof packet.dirty === 'boolean' && (packet.savedText === null || typeof packet.savedText === 'string')
    && Number.isInteger(packet.previousProblemCount) && typeof packet.closed === 'boolean' && Array.isArray(packet.diagnostics)
    && packet.diagnostics.every(diagnostic => diagnostic && typeof diagnostic === 'object' && typeof diagnostic.message === 'string' && Number.isInteger(diagnostic.severity)
      && validPosition(diagnostic.range?.start) && validPosition(diagnostic.range?.end));
}
function validPosition(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const position = value as { line?: unknown; character?: unknown };
  return Number.isInteger(position.line) && (position.line as number) >= 0
    && Number.isInteger(position.character) && (position.character as number) >= 0;
}
